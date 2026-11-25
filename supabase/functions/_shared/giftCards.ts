// Logique serveur des cartes cadeaux — fonctions Supabase (Deno).
// Tout ce qui touche à l'argent ou à la base passe ici, jamais par le navigateur.
//
// Secrets (Supabase > Edge Functions > Secrets) :
//   RESEND_API_KEY, EMAIL_FROM, OWNER_NOTIFICATION_EMAIL, SITE_URL,
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, ALLOW_SIMULATED_PAYMENT (préprod)
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import QRCode from "npm:qrcode@1.5.4";
import catalogue from "./catalogue.json" with { type: "json" };

export const PLANITY = "https://www.planity.com/latelier-mya-91700-sainte-genevieve-des-bois";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 signes, sans 0/O/1/I
const VALIDITY_MONTHS = 6;
const env = (k: string) => Deno.env.get(k) ?? "";

// deno-lint-ignore no-explicit-any
export type Card = Record<string, any>;

// ─── Utilitaires ────────────────────────────────────────────────────────────
let _db: SupabaseClient | null = null;
export function db(): SupabaseClient {
  if (!_db) _db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  return _db;
}

export function siteUrl() {
  return (env("SITE_URL") || "https://lateliermya.fr").replace(/\/$/, "");
}

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS, ...headers },
  });
}

export function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function euros(cents: number) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: cents % 100 ? 2 : 0 });
}

export function dateFR(d: string | Date) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
}

export function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = Array.from(bytes, (b) => ALPHABET[b % 32]); // 256 est multiple de 32 : aucun biais
  return `MYA-${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

export function addMonths(date: Date | string, n: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

// ─── Validation de la commande (le prix vient TOUJOURS du catalogue) ────────
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i;
function clean(s: unknown, max: number) {
  // deno-lint-ignore no-control-regex
  return String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

// deno-lint-ignore no-explicit-any
export function validateOrder(b: any): { order?: Card; error?: string } {
  b = b || {};
  const order: Card = {
    buyer_name: clean(b.buyerName, 80),
    buyer_email: clean(b.buyerEmail, 160).toLowerCase(),
    recipient_name: clean(b.recipientName, 60) || null,
    recipient_email: clean(b.recipientEmail, 160).toLowerCase() || null,
    message: clean(b.message, 240) || null,
    send_at: null,
  };
  if (!order.buyer_name) return { error: "Merci d’indiquer votre nom." };
  if (!EMAIL_RE.test(order.buyer_email)) return { error: "Votre adresse email semble incorrecte." };
  if (order.recipient_email && !EMAIL_RE.test(order.recipient_email)) return { error: "L’adresse email du destinataire semble incorrecte." };

  if (b.sendDate) {
    if (!order.recipient_email) return { error: "Indiquez l’email du destinataire pour programmer l’envoi." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.sendDate)) return { error: "Date d’envoi invalide." };
    const at = new Date(`${b.sendDate}T07:00:00Z`); // ≈ 8h/9h à Paris, heure de la tâche quotidienne
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    if (isNaN(+at) || at < today || at > addMonths(new Date(), 3)) return { error: "La date d’envoi doit être dans les 3 prochains mois." };
    order.send_at = at.toISOString();
  }

  if (b.kind === "soin") {
    const f = catalogue.formules.find((x) => x.id === b.formuleId && x.offrable);
    if (!f) return { error: "Ce soin n’est pas disponible en carte cadeau." };
    Object.assign(order, {
      kind: "soin", soin_id: f.id, soin_name: f.nom, soin_family: f.famille, soin_duration: f.duree,
      amount_cents: f.prix * 100, balance_cents: f.prix * 100,
    });
  } else if (b.kind === "montant") {
    const euro = Number(b.amount);
    if (!catalogue.montants.includes(euro)) return { error: "Montant non disponible." };
    Object.assign(order, { kind: "montant", amount_cents: euro * 100, balance_cents: euro * 100 });
  } else {
    return { error: "Choisissez un soin ou un montant." };
  }
  return { order };
}

// ─── Base de données ────────────────────────────────────────────────────────
export async function createPendingCard(order: Card, paymentMode: "stripe" | "simule"): Promise<Card> {
  for (let i = 0; i < 5; i++) {
    const row = { ...order, code: newCode(), status: "pending", payment_mode: paymentMode, expires_at: addMonths(new Date(), VALIDITY_MONTHS).toISOString() };
    const { data, error } = await db().from("gift_cards").insert(row).select().single();
    if (!error) return data;
    if (error.code !== "23505") throw error; // 23505 = code déjà pris → on retente
  }
  throw new Error("Impossible de générer un code unique");
}

/** Passe une carte de "pending" à "active". Renvoie la carte, ou null si déjà traitée. */
export async function activateCard(id: string, extra: Card = {}): Promise<Card | null> {
  const now = new Date();
  const { data, error } = await db().from("gift_cards")
    .update({ status: "active", paid_at: now.toISOString(), expires_at: addMonths(now, VALIDITY_MONTHS).toISOString(), ...extra })
    .eq("id", id).eq("status", "pending").select().maybeSingle();
  if (error) throw error;
  return data;
}

export function publicCard(c: Card) {
  return {
    status: c.status, code: c.code, kind: c.kind, soinName: c.soin_name, soinFamily: c.soin_family,
    soinDuration: c.soin_duration, amountCents: c.amount_cents, recipientName: c.recipient_name,
    message: c.message, expiresAt: c.expires_at, buyerEmail: c.buyer_email,
    recipientEmail: c.recipient_email, sendAt: c.send_at,
  };
}

// ─── Emails (API Resend) ────────────────────────────────────────────────────
export const cardTitle = (c: Card) => (c.kind === "soin" ? `${c.soin_name} (${c.soin_family})` : euros(c.amount_cents));
const validateUrl = (c: Card) => `${siteUrl()}/valider.html?c=${encodeURIComponent(c.code)}`;
type Attachment = { filename: string; content: string; inline_content_id?: string };

async function qrAttachment(c: Card): Promise<Attachment> {
  const png: Uint8Array = await QRCode.toBuffer(validateUrl(c), {
    type: "png", width: 440, margin: 2, errorCorrectionLevel: "M", color: { dark: "#3D2B1F", light: "#FFFFFF" },
  });
  let bin = "";
  png.forEach((b) => (bin += String.fromCharCode(b)));
  return { filename: "qr-code-carte-cadeau.png", content: btoa(bin), inline_content_id: "qr" };
}

function layout(inner: string) {
  return `<!doctype html><html lang="fr"><body style="margin:0;padding:0;background:#F3EBE0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3EBE0;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FDFAF7;border-radius:16px;font-family:Georgia,'Times New Roman',serif;color:#3D2B1F;">
<tr><td style="padding:28px 32px 8px;font-style:italic;font-size:22px;">L'Atelier <span style="color:#A8664B;font-style:normal;">Mya</span></td></tr>
${inner}
<tr><td style="padding:24px 32px 30px;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#7A5D4D;border-top:1px solid #EADFD2;">
L'Atelier Mya · 24 Av. Charlie Chaplin, 91700 Sainte-Geneviève-des-Bois · <a href="tel:+33638467414" style="color:#7A5D4D;">06 38 46 74 14</a><br>
<a href="${siteUrl()}" style="color:#8B5A43;">${siteUrl().replace(/^https?:\/\//, "")}</a></td></tr>
</table></td></tr></table></body></html>`;
}

// La carte dessinée en HTML (même charte que la carte du site), lisible dans tous les webmails.
function cardVisual(c: Card) {
  const main = c.kind === "soin"
    ? `<div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7A5D4D;">${esc(c.soin_family)}</div>
       <div style="font-family:Georgia,serif;font-style:italic;font-size:30px;line-height:1.15;color:#3D2B1F;margin:4px 0;">${esc(c.soin_name)}</div>
       <div style="font-family:Arial,sans-serif;font-size:13px;color:#7A5D4D;">Un soin de ${esc(c.soin_duration)}</div>`
    : `<div style="font-family:Georgia,serif;font-style:italic;font-size:44px;line-height:1.1;color:#3D2B1F;">${euros(c.amount_cents)}</div>`;
  return `<tr><td style="padding:8px 32px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px solid #C4856A;border-radius:12px;overflow:hidden;background:#F5F1EA;">
<tr>
  <td width="34%" valign="middle" align="center" style="background:#5A3D2C;background-image:linear-gradient(160deg,#3D2B1F,#8B5A43);padding:26px 10px;">
    <div style="font-family:Georgia,serif;font-style:italic;font-size:22px;color:#FDFAF7;">L'Atelier Mya</div>
    <div style="font-family:Arial,sans-serif;font-size:9px;letter-spacing:2px;color:#E8D9CC;margin-top:6px;">INSTITUT DE BIEN-ÊTRE</div>
  </td>
  <td valign="top" style="padding:22px 22px 18px;">
    <div style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:3px;color:#8B5A43;margin-bottom:10px;">CARTE CADEAU</div>
    ${main}
    ${c.recipient_name ? `<div style="font-family:Arial,sans-serif;font-size:12px;color:#7A5D4D;margin-top:14px;">Pour</div><div style="font-family:Georgia,serif;font-style:italic;font-size:19px;color:#3D2B1F;">${esc(c.recipient_name)}</div>` : ""}
    ${c.message ? `<div style="font-family:Georgia,serif;font-style:italic;font-size:14px;line-height:1.5;color:#5C3D2E;margin-top:10px;">«&nbsp;${esc(c.message)}&nbsp;»</div>` : ""}
  </td>
</tr></table></td></tr>`;
}

function codeBlock(c: Card) {
  return `<tr><td style="padding:20px 32px 4px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F1EA;border:1px dashed #C4856A;border-radius:12px;">
  <tr>
    <td width="170" style="padding:18px;" valign="middle"><img src="cid:qr" width="150" height="150" alt="QR code de la carte cadeau" style="display:block;width:150px;height:150px;border-radius:6px;"></td>
    <td style="padding:18px 18px 18px 0;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#5C3D2E;" valign="middle">
      <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7A5D4D;">Code</div>
      <div style="font-family:Georgia,serif;font-size:24px;color:#3D2B1F;letter-spacing:1px;margin-bottom:8px;">${esc(c.code)}</div>
      <strong>Le jour du soin</strong>, présentez ce QR code à l'institut (sur votre téléphone ou imprimé). Il est scanné à votre arrivée et la carte est alors validée.
    </td>
  </tr></table>
</td></tr>
<tr><td style="padding:16px 32px 8px;font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#5C3D2E;">
  <strong>${esc(cardTitle(c))}</strong> · valable jusqu'au <strong>${dateFR(c.expires_at)}</strong>.<br>
  Pour réserver : <a href="${PLANITY}" style="color:#8B5A43;">en ligne sur Planity</a> en indiquant le code dans la note, ou au <a href="tel:+33638467414" style="color:#8B5A43;">06 38 46 74 14</a>.
</td></tr>`;
}

async function send(to: string | string[], subject: string, html: string, attachments?: Attachment[]) {
  const key = env("RESEND_API_KEY");
  if (!key) { console.warn("RESEND_API_KEY absent : email non envoyé →", subject); return false; }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env("EMAIL_FROM") || "L'Atelier Mya <onboarding@resend.dev>", to, subject, html, attachments }),
  });
  if (!res.ok) { console.error("Resend :", res.status, await res.text()); return false; }
  return true;
}

function sendBuyerEmail(c: Card, atts: Attachment[]) {
  const scheduled = c.recipient_email && c.send_at && new Date(c.send_at) > new Date();
  const note = c.recipient_email
    ? `<p style="margin:0 0 6px;">La carte ${scheduled ? `sera envoyée à <strong>${esc(c.recipient_email)}</strong> le <strong>${dateFR(c.send_at)}</strong>` : `a aussi été envoyée à <strong>${esc(c.recipient_email)}</strong>`}. Vous la recevez ici pour la garder ou l'imprimer.</p>`
    : `<p style="margin:0 0 6px;">Vous pouvez transférer cet email ou l'imprimer pour l'offrir.</p>`;
  const html = layout(`
<tr><td style="padding:8px 32px 0;"><h1 style="font-weight:400;font-style:italic;font-size:26px;margin:8px 0 10px;">Merci ${esc(c.buyer_name)} !</h1>
<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#5C3D2E;"><p style="margin:0 0 6px;">Voici votre carte cadeau${c.recipient_name ? ` pour <strong>${esc(c.recipient_name)}</strong>` : ""}.</p>${note}
<p style="margin:0 0 6px;"><a href="${siteUrl()}/carte-cadeau-succes.html?ref=${c.public_token}" style="color:#8B5A43;">Télécharger la carte en image</a></p></div></td></tr>
${cardVisual(c)}${codeBlock(c)}`);
  return send(c.buyer_email, `Votre carte cadeau L'Atelier Mya — ${cardTitle(c)}`, html, atts);
}

function sendRecipientEmail(c: Card, atts: Attachment[]) {
  const who = esc(c.buyer_name || "Quelqu’un");
  const html = layout(`
<tr><td style="padding:8px 32px 0;"><h1 style="font-weight:400;font-style:italic;font-size:26px;margin:8px 0 10px;">${c.recipient_name ? esc(c.recipient_name) + ", " : ""}${who} vous offre un moment rien qu'à vous</h1>
<p style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#5C3D2E;margin:0;">L'Atelier Mya est un institut de bien-être réservé aux femmes à Sainte-Geneviève-des-Bois : Head Spa, Kobido, drainage lymphatique, madérothérapie. <a href="${siteUrl()}/soins/index.html" style="color:#8B5A43;">Découvrir les soins</a>.</p></td></tr>
${cardVisual(c)}${codeBlock(c)}`);
  return send(c.recipient_email, `${c.buyer_name || "On"} vous offre ${c.kind === "soin" ? "un " + c.soin_family : "une carte cadeau"} à L'Atelier Mya 🎁`, html, atts);
}

function sendOwnerEmail(c: Card) {
  const to = env("OWNER_NOTIFICATION_EMAIL").split(",").map((e) => e.trim()).filter(Boolean);
  if (!to.length) return Promise.resolve(false);
  const row = (k: string, v: string) => `<tr><td style="padding:5px 0;color:#7A5D4D;width:150px;">${k}</td><td style="padding:5px 0;">${v}</td></tr>`;
  const html = layout(`<tr><td style="padding:8px 32px 20px;font-family:Arial,sans-serif;font-size:14px;color:#3D2B1F;">
<h1 style="font-family:Georgia,serif;font-weight:400;font-style:italic;font-size:22px;">Nouvelle carte cadeau vendue</h1>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;">
${row("Carte", `<strong>${esc(cardTitle(c))}</strong>`)}${row("Code", esc(c.code))}${row("Montant payé", euros(c.amount_cents))}
${row("Acheteuse", `${esc(c.buyer_name)} — ${esc(c.buyer_email)}`)}
${c.recipient_name ? row("Pour", esc(c.recipient_name)) : ""}${c.recipient_email ? row("Envoi au destinataire", `${esc(c.recipient_email)}${c.send_at ? " — le " + dateFR(c.send_at) : ""}`) : ""}
${row("Expire le", dateFR(c.expires_at))}${row("Paiement", c.payment_mode === "simule" ? "⚠️ simulé (préprod)" : "Stripe")}
</table>
${c.message ? `<p style="font-style:italic;">Message : « ${esc(c.message)} »</p>` : ""}
<p><a href="${siteUrl()}/admin.html?code=${encodeURIComponent(c.code)}" style="color:#8B5A43;">Ouvrir dans le suivi des cartes →</a></p></td></tr>`);
  return send(to, `Carte cadeau vendue — ${cardTitle(c)}`, html);
}

/** Envoie tous les emails qui n'ont pas encore été envoyés pour cette carte. */
export async function sendPendingEmails(c: Card) {
  if (c.status !== "active") return;
  const now = new Date();
  const updates: Card = {};
  let atts: Attachment[] | null = null;
  const getAtts = async () => (atts = atts || [await qrAttachment(c)]);

  if (!c.buyer_email_sent_at && (await sendBuyerEmail(c, await getAtts()))) updates.buyer_email_sent_at = now.toISOString();
  if (c.recipient_email && !c.recipient_email_sent_at && (!c.send_at || new Date(c.send_at) <= now)) {
    if (await sendRecipientEmail(c, await getAtts())) updates.recipient_email_sent_at = now.toISOString();
  }
  if (!c.owner_notified_at && (await sendOwnerEmail(c))) updates.owner_notified_at = now.toISOString();

  if (Object.keys(updates).length) await db().from("gift_cards").update(updates).eq("id", c.id);
}

export async function sendExpiryReminder(c: Card) {
  const to = c.recipient_email || c.buyer_email;
  const html = layout(`<tr><td style="padding:8px 32px 0;"><h1 style="font-weight:400;font-style:italic;font-size:24px;margin:8px 0 10px;">Votre carte cadeau expire bientôt</h1>
<p style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#5C3D2E;">${c.recipient_name ? esc(c.recipient_name) + ", votre" : "Votre"} carte cadeau <strong>${esc(cardTitle(c))}</strong> est valable jusqu'au <strong>${dateFR(c.expires_at)}</strong>. Il est encore temps de réserver votre moment de détente !</p>
<p style="margin:18px 0 6px;"><a href="${PLANITY}" style="display:inline-block;background:#8B5A43;color:#FDFAF7;text-decoration:none;padding:12px 24px;border-radius:999px;font-family:Arial,sans-serif;font-size:13px;letter-spacing:1px;">RÉSERVER MON SOIN</a></p></td></tr>
${cardVisual(c)}${codeBlock(c)}`);
  const ok = await send(to, `Votre carte cadeau L'Atelier Mya expire le ${dateFR(c.expires_at)}`, html, [await qrAttachment(c)]);
  if (ok) await db().from("gift_cards").update({ reminder_sent_at: new Date().toISOString() }).eq("id", c.id);
  return ok;
}
