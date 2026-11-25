# L'Atelier Mya — site + cartes cadeaux (v3)

**Hébergement :** pages sur **Cloudflare Pages** (domaine `lateliermya.fr`, dépôt GitHub privé) ; base de données et fonctions serveur sur **Supabase** (Edge Functions).

## Ce qui a changé en v3

- **Cartes cadeaux par soin** (« Rituel Prestige », « Kobido Signature »…) ou par montant, avec un **vrai paiement Stripe**.
- **QR code dans l'email.** Myriam le scanne avec l'appareil photo de son téléphone, et la carte est **validée automatiquement** (marquée utilisée). En cas d'erreur, elle peut annuler pendant 15 minutes. Si une cliente scanne elle-même son QR code, la carte n'est pas validée : elle voit seulement un message.
- **Envoi au destinataire** à la date choisie, plus un **rappel automatique 30 jours avant l'expiration**.
- **Sécurité :**
  - le public n'a plus aucun accès à la base ;
  - le prix est vérifié côté serveur ;
  - seules les administratrices listées dans la table `admins` peuvent lire ou valider une carte ;
  - tous les textes sont échappés (emails et suivi).
- **Site :**
  - section « Qui est Myriam ? » ;
  - quiz « Quel soin pour moi ? » ;
  - avis en grille, avis Google et flux Instagram (optionnels) ;
  - FAQ générale ;
  - fenêtre « contre-indications » avant chaque réservation Planity ;
  - badge « Ouvert maintenant », bouton WhatsApp, barre « Réserver » sur mobile ;
  - carte Google Maps chargée seulement au clic (RGPD) ;
  - contraste des couleurs aux normes AA ;
  - journal (4 articles), section avant/après (masquée tant qu'il n'y a pas de photos).

## Organisation des fichiers

```
index.html                     accueil (écrit à la main)
soins/, journal/               GÉNÉRÉS — ne pas modifier à la main
carte-cadeau*.html, valider.html, admin.html   GÉNÉRÉS depuis _outils/gabarits/
assets/config.js               ← réglages (WhatsApp, Plausible, horaires, Supabase)
assets/site.css, composants.css, cadeau.css, site.js
assets/catalogue.js            GÉNÉRÉ (prix des soins, pour le navigateur)
lib/giftCardDraw.js            dessin de la carte (page de confirmation + aperçu)
supabase/schema.sql            tables, règles RLS, fonctions de validation
supabase/cron.sql              tâche quotidienne (pg_cron)
supabase/functions/            create-gift-card, stripe-webhook, gift-card-status,
                               gift-card-cron, google-reviews, instagram-feed
supabase/functions/_shared/    logique commune + catalogue.json (GÉNÉRÉ, vérification des prix)
_outils/contenu_soins.py       ← soins, prix, avis, texte de Myriam, avant/après
_outils/contenu_journal.py     ← articles du journal
_headers, _redirects           en-têtes HTTP et redirections (Cloudflare Pages)
_outils/construire-site.sh     prépare dist/ : seuls les fichiers du site sont publiés
```

**Après toute modification de contenu ou de prix :**
```bash
python3 _outils/generer_pages_soins.py
```
Puis pousse sur GitHub : Cloudflare republie le site automatiquement. Si un **prix** a changé, redéploie aussi `create-gift-card` (voir l'étape 2) : le serveur vérifie les prix avec sa propre copie du catalogue.

## Mise en service

### 1. Supabase — base de données
1. Dans **SQL Editor**, lance `supabase/schema.sql`. Le script peut être relancé sans risque.
2. Déclare Myriam administratrice (remplace l'email) :
   ```sql
   insert into admins (user_id) select id from auth.users where email = 'email-de-myriam@exemple.fr';
   ```
3. Dans **Authentication > Sign In / Providers**, désactive **Allow new users to sign up**.
4. Dans **Authentication > URL Configuration**, mets **Site URL** = `https://lateliermya.fr`.

### 2. Supabase — fonctions serveur
Avec la CLI Supabase, depuis la racine du projet :
```bash
supabase login
supabase link --project-ref gsriapmzlbyzmznkssrt
supabase functions deploy
```
Le fichier `supabase/config.toml` désactive la vérification JWT de Supabase pour ces fonctions, car elles sont appelées par le site, par Stripe et par pg_cron. Chacune fait ses propres contrôles.

Secrets à enregistrer dans **Edge Functions > Secrets** (ou avec `supabase secrets set NOM=valeur`) :

| Secret | Obligatoire | Valeur |
|---|---|---|
| `SITE_URL` | oui | `https://lateliermya.fr` |
| `RESEND_API_KEY` | oui | clé Resend |
| `EMAIL_FROM` | oui | `L'Atelier Mya <cartescadeaux@lateliermya.fr>` (domaine vérifié sur Resend) |
| `OWNER_NOTIFICATION_EMAIL` | oui | email(s) de Myriam, séparés par des virgules |
| `CRON_SECRET` | oui | une longue chaîne aléatoire (la même que dans `cron.sql`) |
| `STRIPE_SECRET_KEY` | en production | `sk_live_…` (`sk_test_…` pour tester) |
| `STRIPE_WEBHOOK_SECRET` | en production | `whsec_…` |
| `ALLOW_SIMULATED_PAYMENT` | préprod seulement | `true` permet de tester sans Stripe. **Ne jamais l'activer en production.** |
| `GOOGLE_PLACES_API_KEY`, `GOOGLE_PLACE_ID` | non | affiche les avis Google |
| `INSTAGRAM_ACCESS_TOKEN` | non | jeton longue durée (API Instagram, compte pro) |

`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont fournis automatiquement aux fonctions.

### 3. Tâche quotidienne
Active **pg_cron** et **pg_net** (Database > Extensions). Remplace le secret dans `supabase/cron.sql`, puis lance le fichier dans le SQL Editor.

### 4. Stripe
- Clé secrète : **Développeurs > Clés API**.
- Webhook (**Développeurs > Webhooks**) :
  - URL : `https://gsriapmzlbyzmznkssrt.supabase.co/functions/v1/stripe-webhook`
  - Événements : `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`
  - Récupère ensuite le **secret de signature** (`whsec_…`).

### 5. Cloudflare Pages + domaine lateliermya.fr
1. Crée un compte gratuit sur cloudflare.com.
2. **Ajoute le domaine** : **Add a domain** > `lateliermya.fr` > offre **Free**. Cloudflare importe la zone DNS d'OVH.
   ⚠️ Vérifie que les lignes **MX**, **SPF**, **SRV**, les CNAME mail/smtp/imap/pop3/autoconfig/autodiscover, les DKIM OVH, `resend._domainkey`, `send`, `rsend` et `_dmarc` sont bien présentes (sinon recopie-les depuis OVH). Supprime les A/AAAA/TXT de parking OVH sur `@` et `www`. Les CNAME de messagerie doivent rester en **DNS only** (nuage gris).
3. Sur OVH, dans **Noms de domaine > lateliermya.fr > Serveurs DNS > Modifier**, remplace les serveurs OVH par les deux serveurs indiqués par Cloudflare (`xxx.ns.cloudflare.com`). Le changement prend de quelques heures à 24 h.
4. Dans **Workers & Pages > Create > Pages > Connect to Git**, choisis le dépôt `ateliermya` (il peut être **privé**) :
   - Branche de production : `main`
   - Build command : `sh _outils/construire-site.sh`
   - Build output directory : `dist`
5. Dans le projet Pages, ouvre **Custom domains** et ajoute `lateliermya.fr` puis `www.lateliermya.fr`. Cloudflare crée les entrées DNS et le certificat HTTPS tout seul.
6. **Préprod protégée pour de vrai (recommandé)** : **Zero Trust > Access > Applications > Add > Self-hosted**, domaine `lateliermya.fr`, règle « Emails » avec ton adresse. L'accès se fait alors par un code reçu par email, gratuit jusqu'à 50 personnes. Tu peux ensuite retirer le verrou JavaScript (voir la checklist). ⚠️ Laisse en dehors de cette protection les adresses appelées par Stripe et Supabase : aucune ne passe par ce domaine, donc rien à faire de plus.

### 6. Réglages du site (`assets/config.js`)
- `whatsapp` : numéro WhatsApp de Myriam (⚠️ **à confirmer**). Laisse `''` pour masquer le bouton.
- `plausibleDomain` : renseigne `lateliermya.fr` après avoir créé le site sur plausible.io.

### 7. Google
- **Search Console** : ajoute `lateliermya.fr` et soumets `sitemap.xml`.
- **Fiche Google Business** : ajoute le lien du site et les services.

## Checklist de mise en ligne
- [ ] Domaine sur Cloudflare, `lateliermya.fr` et `www` ajoutés au projet Pages, HTTPS actif.
- [ ] Verrou de préprod retiré : `LOCK = ""` dans le générateur (puis relancer), et suppression du bloc `siteLockOverlay` dans `index.html`, `mentions-legales.html` et `politique-confidentialite.html`. ⚠️ Ce verrou ne protège rien : le mot de passe se lit dans le code source des pages. Préfère Cloudflare Access (étape 5).
- [ ] `ALLOW_SIMULATED_PAYMENT` supprimée, clés Stripe **live** en place.
- [ ] Un achat test réel (puis remboursement dans Stripe et annulation dans `admin.html`).
- [ ] Scan du QR code reçu depuis le téléphone de Myriam : la carte passe en « Utilisée ».

## Bon à savoir
- Seul le dossier `dist/` est publié : `_outils/`, `supabase/` et le README ne sont jamais accessibles en ligne.
- La carte reçue par email est dessinée en HTML. L'image PNG téléchargeable se trouve sur la page de confirmation, accessible via un lien dans l'email.

## À faire valider par Myriam
- Le texte « Qui est Myriam ? » et ses formations (`MYRIAM` dans `contenu_soins.py`). Ajoute sa photo dans `assets/photos/`.
- Les contre-indications ajoutées au-delà de celles de Planity (Kobido, drainage, madérothérapie, LED).
- Les articles du journal.
- Les conditions de la carte cadeau (validité 6 mois, utilisable en une fois, non remboursable).
- Les photos avant/après : à ajouter dans `AVANT_APRES`, **avec l'autorisation écrite des clientes**.
- De vraies photos de l'institut, à la place des photos Unsplash.
