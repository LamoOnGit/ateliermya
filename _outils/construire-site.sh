#!/bin/sh
# Construit le dossier "dist" publié par Cloudflare Pages : uniquement les
# fichiers du site. Les sources (_outils, supabase, README…) ne sont jamais publiées.
# Réglages Cloudflare Pages : commande de build = sh _outils/construire-site.sh
#                             dossier de sortie  = dist
set -e
rm -rf dist
mkdir -p dist
cp *.html robots.txt sitemap.xml _headers _redirects dist/
cp -r assets soins journal dist/
mkdir -p dist/lib && cp lib/giftCardDraw.js dist/lib/
echo "Site prêt dans dist/ ($(find dist -type f | wc -l) fichiers)"
