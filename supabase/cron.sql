-- ============================================================
-- Tâche quotidienne des cartes cadeaux (envois programmés, rappels,
-- nettoyage, jeton Instagram) — à exécuter UNE FOIS dans le SQL Editor,
-- APRÈS avoir déployé la fonction gift-card-cron.
--
-- 1. Database > Extensions : activer pg_cron et pg_net.
-- 2. Choisir un secret (longue chaîne aléatoire), le mettre :
--      • dans Edge Functions > Secrets sous le nom CRON_SECRET
--      • à la place de REMPLACER_PAR_LE_CRON_SECRET ci-dessous
-- ============================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('mya-gift-card-cron')
where exists (select 1 from cron.job where jobname = 'mya-gift-card-cron');

-- Tous les jours à 7h15 UTC (8h15 à Paris en hiver, 9h15 en été)
select cron.schedule(
  'mya-gift-card-cron',
  '15 7 * * *',
  $$
  select net.http_post(
    url     := 'https://gsriapmzlbyzmznkssrt.supabase.co/functions/v1/gift-card-cron',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "REMPLACER_PAR_LE_CRON_SECRET"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
