# L'Atelier Mya — site + cartes cadeaux (v3)

**Hébergement :** pages sur **GitHub Pages**, publiées automatiquement à chaque push (domaine `lateliermya.fr`) ; base de données et fonctions serveur sur **Supabase** (Edge Functions).

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
.github/workflows/pages.yml    publication automatique sur GitHub Pages à chaque push
_outils/construire-site.sh     prépare dist/ : seuls les fichiers du site sont publiés
CNAME                          domaine lateliermya.fr
```

**Après toute modification de contenu ou de prix :**
```bash
python3 _outils/generer_pages_soins.py
```
Puis pousse sur GitHub : le site est republié automatiquement en 1 à 2 minutes (onglet **Actions**). Si un **prix** a changé, redéploie aussi `create-gift-card` (voir l'étape 2) : le serveur vérifie les prix avec sa propre copie du catalogue.

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

### 5. GitHub Pages + domaine lateliermya.fr
1. Dans le dépôt, va dans **Settings > Pages > Build and deployment > Source** et choisis **GitHub Actions** (une seule fois).
2. Chaque push sur `main` lance la publication (onglet **Actions**, workflow « Publier le site »). Seul le dossier `dist/` est mis en ligne.
3. Dans **Settings > Pages > Custom domain**, vérifie que `lateliermya.fr` est indiqué.
4. Zone DNS OVH :
   - supprime A `@` 51.91.236.255, A `www` 51.91.236.255, AAAA `@` et `www` 2001:41d0:301::29, TXT `@` "1|www.lateliermya.fr", TXT `www` "3|welcome", ainsi que toute redirection dans l'onglet **Redirection** ;
   - ajoute 4 enregistrements A sur `@` : 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153 ;
   - ajoute un CNAME `www` vers `lamoongit.github.io.` ;
   - ne touche pas aux lignes MX, SPF, SRV, DKIM, Resend et `_dmarc`, qui servent aux emails.
5. Une fois le DNS validé par GitHub, coche **Enforce HTTPS**.

### 6. Réglages du site (`assets/config.js`)
- `whatsapp` : numéro WhatsApp de Myriam (⚠️ **à confirmer**). Laisse `''` pour masquer le bouton.
- `plausibleDomain` : renseigne `lateliermya.fr` après avoir créé le site sur plausible.io.

### 7. Google
- **Search Console** : ajoute `lateliermya.fr` et soumets `sitemap.xml`.
- **Fiche Google Business** : ajoute le lien du site et les services.

## Checklist de mise en ligne
- [ ] DNS OVH vers GitHub Pages, HTTPS actif.
- [ ] Verrou de préprod retiré : `LOCK = ""` dans le générateur (puis relancer), et suppression du bloc `siteLockOverlay` dans `index.html`, `mentions-legales.html` et `politique-confidentialite.html`. ⚠️ Ce verrou ne protège rien : le mot de passe se lit dans le code source des pages. 
- [ ] `ALLOW_SIMULATED_PAYMENT` supprimée, clés Stripe **live** en place.
- [ ] Un achat test réel (puis remboursement dans Stripe et annulation dans `admin.html`).
- [ ] Scan du QR code reçu depuis le téléphone de Myriam : la carte passe en « Utilisée ».

## Bon à savoir
- Seul le dossier `dist/` est publié sur lateliermya.fr. ⚠️ Le dépôt GitHub étant public, son code reste lisible sur github.com.
- GitHub Pages ignore `_headers` et `_redirects` : le `noindex` des pages internes passe par la balise `<meta name="robots">`.
- La carte reçue par email est dessinée en HTML. L'image PNG téléchargeable se trouve sur la page de confirmation, accessible via un lien dans l'email.

## À faire valider par Myriam
- Le texte « Qui est Myriam ? » et ses formations (`MYRIAM` dans `contenu_soins.py`). Ajoute sa photo dans `assets/photos/`.
- Les contre-indications ajoutées au-delà de celles de Planity (Kobido, drainage, madérothérapie, LED).
- Les articles du journal.
- Les conditions de la carte cadeau (validité 6 mois, utilisable en une fois, non remboursable).
- Les photos avant/après : à ajouter dans `AVANT_APRES`, **avec l'autorisation écrite des clientes**.
- De vraies photos de l'institut, à la place des photos Unsplash.
