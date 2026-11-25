// ============================================================
// L'Atelier Mya — réglages du site (un seul endroit à modifier)
// ============================================================
window.MYA_CONFIG = {
  planityUrl: 'https://www.planity.com/latelier-mya-91700-sainte-genevieve-des-bois',
  phone: '+33638467414',

  // Numéro WhatsApp au format international sans "+" (ex. 33638467414).
  // ⚠️ À confirmer avec Myriam. Laisser vide ('') pour masquer le bouton.
  whatsapp: '33638467414',

  // Statistiques Plausible (sans cookies, pas de bandeau nécessaire).
  // Renseigner le domaine déclaré sur plausible.io, ex. 'lateliermyaparis.fr'.
  // Vide = aucune statistique chargée.
  plausibleDomain: '',

  // Fonctions serveur (Supabase Edge Functions)
  functionsUrl: 'https://gsriapmzlbyzmznkssrt.supabase.co/functions/v1',
  // Optionnelles : renvoient simplement "rien" tant que les clés API ne sont pas
  // enregistrées dans Supabase > Edge Functions > Secrets.
  googleReviews: true,
  instagramFeed: true,

  // Supabase (clé publique "anon" : normale ici, la sécurité vient des règles RLS)
  supabaseUrl: 'https://gsriapmzlbyzmznkssrt.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzcmlhcG16bGJ5em16bmtzc3J0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNTg1NjcsImV4cCI6MjEwNTczNDU2N30.pYHA3X1e91-A2A3i0YalI2wnr8gWU9lUx7HK2eYUj4w',

  // Horaires (heure de Paris) — 0 = dimanche … 6 = samedi ; null = fermé
  horaires: { 0: null, 1: [9, 20], 2: [9, 20], 3: [10, 20], 4: [9, 20], 5: [9, 20], 6: [10, 19] }
};
