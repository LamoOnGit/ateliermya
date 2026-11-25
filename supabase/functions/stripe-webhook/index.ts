// POST /functions/v1/stripe-webhook  (à déclarer dans Stripe > Développeurs > Webhooks)
// Événements : checkout.session.completed, checkout.session.async_payment_succeeded,
//              checkout.session.async_payment_failed, checkout.session.expired
import Stripe from "npm:stripe@17.7.0";
import { activateCard, db, json, sendPendingEmails } from "../_shared/giftCards.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { httpClient: Stripe.createFetchHttpClient() });
const crypto = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Méthode non autorisée." });
  const raw = await req.text();
  let evt: Stripe.Event;
  try {
    evt = await stripe.webhooks.constructEventAsync(raw, req.headers.get("stripe-signature") ?? "", Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "", undefined, crypto);
  } catch (e) {
    console.error("Signature Stripe invalide :", (e as Error).message);
    return json(400, { error: "Signature invalide" });
  }

  const session = evt.data.object as Stripe.Checkout.Session;
  const id = session.metadata?.gift_card_id;
  if (!id) return json(200, { ignored: true });

  try {
    if ((evt.type === "checkout.session.completed" && session.payment_status === "paid") || evt.type === "checkout.session.async_payment_succeeded") {
      const card = await activateCard(id, { stripe_session_id: session.id });
      if (card) await sendPendingEmails(card); // null = déjà activée (Stripe peut renvoyer un événement)
    } else if (evt.type === "checkout.session.expired" || evt.type === "checkout.session.async_payment_failed") {
      await db().from("gift_cards").update({ status: "cancelled" }).eq("id", id).eq("status", "pending");
    }
    return json(200, { received: true });
  } catch (e) {
    console.error(e);
    return json(500, { error: "Erreur de traitement" }); // Stripe réessaiera
  }
});
