// Tâche quotidienne, déclenchée par pg_cron (voir supabase/cron.sql) :
//  1. cartes expirées → statut "expired"
//  2. envois programmés au destinataire + emails qui avaient échoué
//  3. rappel 30 jours avant expiration
//  4. nettoyage des commandes jamais payées
//  5. rafraîchissement du jeton Instagram (valable 60 jours)
// Protégée par l'en-tête x-cron-secret (secret CRON_SECRET).
import { db, json, sendExpiryReminder, sendPendingEmails } from "../_shared/giftCards.ts";

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json(401, { error: "Non autorisé" });

  const now = new Date();
  const report = { sent: 0, reminders: 0, purged: 0, instagram: "skip" };
  try {
    await db().rpc("mark_expired_gift_cards");

    const { data: toSend } = await db().from("gift_cards").select("*").eq("status", "active")
      .or("buyer_email_sent_at.is.null,and(recipient_email.not.is.null,recipient_email_sent_at.is.null)")
      .lte("paid_at", new Date(+now - 10 * 60e3).toISOString()).limit(200);
    // sendPendingEmails ne part que si la date d'envoi programmée est atteinte
    for (const c of toSend ?? []) { await sendPendingEmails(c); report.sent++; }

    const in30 = new Date(+now + 30 * 864e5).toISOString();
    const { data: soon } = await db().from("gift_cards").select("*").eq("status", "active")
      .is("reminder_sent_at", null).lte("expires_at", in30).gt("expires_at", now.toISOString()).limit(50);
    for (const c of soon ?? []) { if (await sendExpiryReminder(c)) report.reminders++; }

    const { count } = await db().from("gift_cards").delete({ count: "exact" })
      .eq("status", "pending").lt("created_at", new Date(+now - 3 * 864e5).toISOString());
    report.purged = count ?? 0;
  } catch (e) {
    console.error("Cron cartes cadeaux :", e);
  }

  try { report.instagram = await refreshInstagramToken(); } catch (e) { console.error("Instagram :", (e as Error).message); }
  console.log("gift-card-cron", report);
  return json(200, report);
});

async function refreshInstagramToken() {
  const { data } = await db().from("app_settings").select("*").eq("key", "instagram_token").maybeSingle();
  const token = data?.value || Deno.env.get("INSTAGRAM_ACCESS_TOKEN");
  if (!token) return "non configuré";
  if (data && new Date(data.updated_at) > new Date(Date.now() - 7 * 864e5)) return "à jour";
  const r = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
  const j = await r.json();
  if (!j.access_token) throw new Error(JSON.stringify(j));
  await db().from("app_settings").upsert({ key: "instagram_token", value: j.access_token, updated_at: new Date().toISOString() });
  return "rafraîchi";
}
