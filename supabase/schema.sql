-- ============================================================
-- Cartes cadeaux — L'Atelier Mya  (v3 : cartes par soin, Stripe, QR code)
--
-- Ce script peut être exécuté sur une base neuve OU relancé sur la base
-- existante (v2) : il ajoute ce qui manque sans rien effacer.
-- Supabase > SQL Editor > coller > Run.
--
-- Principe de sécurité :
--   • Le public (clé anon) n'a PLUS AUCUN droit sur les tables. Les cartes
--     sont créées uniquement côté serveur (fonctions Netlify, clé service_role),
--     après vérification du prix dans le catalogue et du paiement Stripe.
--   • Seuls les comptes listés dans la table `admins` (Myriam) peuvent lire,
--     valider ou débiter une carte — même si quelqu'un d'autre réussit à se
--     créer un compte Supabase Auth.
-- ============================================================

create extension if not exists "pgcrypto";

-- ─── Table des cartes ───────────────────────────────────────
create table if not exists gift_cards (
  id                uuid primary key default gen_random_uuid(),
  code              text unique not null,
  amount_cents      integer not null,
  balance_cents     integer not null,
  buyer_name        text,
  buyer_email       text not null,
  recipient_name    text,
  message           text,
  status            text not null default 'active',
  stripe_session_id text unique,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  redeemed_at       timestamptz
);

-- Colonnes ajoutées en v3
alter table gift_cards add column if not exists kind                    text not null default 'montant'; -- soin | montant
alter table gift_cards add column if not exists soin_id                 text;   -- ex. head-spa-2 (catalogue)
alter table gift_cards add column if not exists soin_name               text;   -- ex. Rituel Prestige
alter table gift_cards add column if not exists soin_family             text;   -- ex. Head Spa
alter table gift_cards add column if not exists soin_duration           text;   -- ex. 1 h
alter table gift_cards add column if not exists recipient_email         text;
alter table gift_cards add column if not exists send_at                 timestamptz; -- envoi programmé au destinataire
alter table gift_cards add column if not exists public_token            uuid not null default gen_random_uuid();
alter table gift_cards add column if not exists payment_mode            text not null default 'stripe'; -- stripe | simule
alter table gift_cards add column if not exists paid_at                 timestamptz;
alter table gift_cards add column if not exists buyer_email_sent_at     timestamptz;
alter table gift_cards add column if not exists recipient_email_sent_at timestamptz;
alter table gift_cards add column if not exists owner_notified_at       timestamptz;
alter table gift_cards add column if not exists reminder_sent_at        timestamptz;

-- Statuts : pending (en attente de paiement) | active | used | expired | cancelled
alter table gift_cards alter column status set default 'pending';
alter table gift_cards drop constraint if exists gift_cards_status_check;
alter table gift_cards add constraint gift_cards_status_check
  check (status in ('pending','active','used','expired','cancelled'));
alter table gift_cards drop constraint if exists gift_cards_kind_check;
alter table gift_cards add constraint gift_cards_kind_check check (kind in ('soin','montant'));
alter table gift_cards drop constraint if exists gift_cards_balance_check;
alter table gift_cards add constraint gift_cards_balance_check
  check (balance_cents >= 0 and balance_cents <= amount_cents);

create unique index if not exists idx_gift_cards_public_token on gift_cards (public_token);
create index if not exists idx_gift_cards_code   on gift_cards (code);
create index if not exists idx_gift_cards_status on gift_cards (status);

-- ─── Historique des utilisations ────────────────────────────
create table if not exists gift_card_redemptions (
  id            uuid primary key default gen_random_uuid(),
  gift_card_id  uuid not null references gift_cards(id) on delete cascade,
  amount_cents  integer not null,
  note          text,
  redeemed_by   text,
  redeemed_at   timestamptz not null default now()
);
create index if not exists idx_redemptions_card on gift_card_redemptions (gift_card_id);

-- ─── Administratrices ───────────────────────────────────────
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

-- ─── Petits réglages applicatifs (jeton Instagram rafraîchi par le cron) ──
create table if not exists app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- RLS
-- ============================================================
alter table gift_cards            enable row level security;
alter table gift_card_redemptions enable row level security;
alter table admins                enable row level security;
alter table app_settings          enable row level security;

-- Anciennes règles v2 (trop larges) — supprimées
drop policy if exists "public peut créer une carte cadeau" on gift_cards;
drop policy if exists "mya peut tout lire"                  on gift_cards;
drop policy if exists "mya peut débiter une carte"          on gift_cards;
drop policy if exists "mya peut lire l'historique"          on gift_card_redemptions;
drop policy if exists "mya peut enregistrer un débit"       on gift_card_redemptions;

-- Lecture réservée aux administratrices. Les modifications passent par les
-- fonctions ci-dessous (atomiques), jamais par un UPDATE direct.
drop policy if exists "admin lit les cartes" on gift_cards;
create policy "admin lit les cartes" on gift_cards
  for select to authenticated using (is_admin());

drop policy if exists "admin lit l'historique" on gift_card_redemptions;
create policy "admin lit l'historique" on gift_card_redemptions
  for select to authenticated using (is_admin());

drop policy if exists "admin se voit" on admins;
create policy "admin se voit" on admins
  for select to authenticated using (user_id = auth.uid());
-- app_settings : aucune règle → accessible uniquement avec la clé service_role.

-- ============================================================
-- Fonctions appelées depuis valider.html et admin.html
-- (security definer + vérification is_admin() en première ligne)
-- ============================================================

-- Scan du QR code : valide la carte en une fois (soin consommé / solde à 0).
create or replace function redeem_gift_card(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare c gift_cards%rowtype; consumed integer;
begin
  if not is_admin() then raise exception 'not_admin'; end if;

  select * into c from gift_cards where code = upper(trim(p_code)) for update;
  if not found then return json_build_object('ok', false, 'reason', 'not_found'); end if;

  if c.status = 'active' and c.expires_at < now() then
    update gift_cards set status = 'expired' where id = c.id;
    c.status := 'expired';
  end if;

  if c.status <> 'active' then
    return json_build_object('ok', false, 'reason', c.status, 'card', row_to_json(c));
  end if;

  consumed := c.balance_cents;
  update gift_cards set status = 'used', balance_cents = 0, redeemed_at = now()
   where id = c.id returning * into c;
  insert into gift_card_redemptions (gift_card_id, amount_cents, note, redeemed_by)
  values (c.id, consumed, 'Validation par QR code', coalesce(auth.jwt() ->> 'email', 'admin'));

  return json_build_object('ok', true, 'card', row_to_json(c), 'consumed_cents', consumed);
end $$;

-- Annule une validation faite par erreur (dans les 15 minutes).
create or replace function undo_redemption(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare c gift_cards%rowtype; r gift_card_redemptions%rowtype;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  select * into c from gift_cards where code = upper(trim(p_code)) for update;
  if not found then return json_build_object('ok', false, 'reason', 'not_found'); end if;

  select * into r from gift_card_redemptions
   where gift_card_id = c.id order by redeemed_at desc limit 1;
  if not found or r.redeemed_at < now() - interval '15 minutes' then
    return json_build_object('ok', false, 'reason', 'too_late');
  end if;

  delete from gift_card_redemptions where id = r.id;
  update gift_cards
     set balance_cents = least(amount_cents, balance_cents + r.amount_cents),
         status = 'active', redeemed_at = null
   where id = c.id returning * into c;
  return json_build_object('ok', true, 'card', row_to_json(c));
end $$;

-- Débit partiel (cartes "montant" uniquement), depuis admin.html.
create or replace function debit_gift_card(p_code text, p_amount_cents integer)
returns json language plpgsql security definer set search_path = public as $$
declare c gift_cards%rowtype;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    return json_build_object('ok', false, 'reason', 'bad_amount');
  end if;
  select * into c from gift_cards where code = upper(trim(p_code)) for update;
  if not found then return json_build_object('ok', false, 'reason', 'not_found'); end if;
  if c.status <> 'active' or c.expires_at < now() then
    return json_build_object('ok', false, 'reason', c.status);
  end if;
  if p_amount_cents > c.balance_cents then
    return json_build_object('ok', false, 'reason', 'insufficient', 'card', row_to_json(c));
  end if;
  update gift_cards
     set balance_cents = balance_cents - p_amount_cents,
         status = case when balance_cents - p_amount_cents = 0 then 'used' else 'active' end,
         redeemed_at = now()
   where id = c.id returning * into c;
  insert into gift_card_redemptions (gift_card_id, amount_cents, note, redeemed_by)
  values (c.id, p_amount_cents, 'Débit manuel', coalesce(auth.jwt() ->> 'email', 'admin'));
  return json_build_object('ok', true, 'card', row_to_json(c));
end $$;

-- Annulation (remboursement fait à part dans Stripe).
create or replace function cancel_gift_card(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare c gift_cards%rowtype;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  update gift_cards set status = 'cancelled'
   where code = upper(trim(p_code)) and status in ('active','pending')
   returning * into c;
  if not found then return json_build_object('ok', false, 'reason', 'not_cancellable'); end if;
  return json_build_object('ok', true, 'card', row_to_json(c));
end $$;

create or replace function mark_expired_gift_cards() returns void
language sql security definer set search_path = public as $$
  update gift_cards set status = 'expired' where status = 'active' and expires_at < now();
$$;

-- Le public ne peut appeler aucune de ces fonctions.
revoke all on function redeem_gift_card(text)              from public, anon;
revoke all on function undo_redemption(text)               from public, anon;
revoke all on function debit_gift_card(text, integer)      from public, anon;
revoke all on function cancel_gift_card(text)              from public, anon;
revoke all on function mark_expired_gift_cards()           from public, anon;
grant execute on function redeem_gift_card(text)           to authenticated;
grant execute on function undo_redemption(text)            to authenticated;
grant execute on function debit_gift_card(text, integer)   to authenticated;
grant execute on function cancel_gift_card(text)           to authenticated;
grant execute on function is_admin()                       to authenticated;

-- ============================================================
-- À FAIRE UNE FOIS, après avoir créé le compte de Myriam
-- (Authentication > Users > Add user) — remplacer l'email :
--
--   insert into admins (user_id)
--   select id from auth.users where email = 'email-de-myriam@exemple.fr'
--   on conflict do nothing;
--
-- Et dans Authentication > Sign In / Providers : désactiver
-- « Allow new users to sign up ».
-- ============================================================
