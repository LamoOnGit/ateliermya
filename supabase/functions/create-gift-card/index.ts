// POST /functions/v1/create-gift-card
// Crée la carte (statut "pending") puis renvoie l'URL de paiement Stripe.
// Le prix est TOUJOURS pris dans le catalogue côté serveur, jamais dans la requête.
import Stripe from "npm:stripe@17.7.0";
import { activateCard, cardTitle, CORS, createPendingCard, db, json, sendPendingEmails, siteUrl, validateOrder } from "../_shared/giftCards.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Méthode non autorisée." });

  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: "Requête invalide." }); }
  if (body.website) return json(400, { error: "Requête invalide." }); // champ piège anti-robots

  const { order, error } = validateOrder(body);
  if (error || !order) return json(400, { error });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const simulated = !stripeKey && Deno.env.get("ALLOW_SIMULATED_PAYMENT") === "true";
  if (!stripeKey && !simulated) return json(503, { error: "Le paiement en ligne est momentanément indisponible. Appelez l’institut au 06 38 46 74 14." });

  try {
    const card = await createPendingCard(order, simulated ? "simule" : "stripe");
    const successUrl = `${siteUrl()}/carte-cadeau-succes.html?ref=${card.public_token}`;

    if (simulated) {
      const active = await activateCard(card.id);
      if (active) await sendPendingEmails(active);
      return json(200, { url: successUrl, simulated: true });
    }

    const stripe = new Stripe(stripeKey!, { httpClient: Stripe.createFetchHttpClient() });
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      locale: "fr",
      customer_email: card.buyer_email,
      client_reference_id: card.id,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: card.amount_cents,
          product_data: {
            name: `Carte cadeau L'Atelier Mya — ${cardTitle(card)}`,
            description: `${card.kind === "soin" ? card.soin_duration + " · " : ""}Valable 6 mois${card.recipient_name ? " · pour " + card.recipient_name : ""}`,
          },
        },
      }],
      metadata: { gift_card_id: card.id },
      payment_intent_data: { description: `Carte cadeau ${card.code}`, metadata: { gift_card_id: card.id, code: card.code } },
      success_url: successUrl,
      cancel_url: `${siteUrl()}/carte-cadeau.html?annule=1`,
    });
    await db().from("gift_cards").update({ stripe_session_id: session.id }).eq("id", card.id);
    return json(200, { url: session.url });
  } catch (e) {
    console.error(e);
    return json(500, { error: "Une erreur est survenue. Réessayez ou appelez l’institut au 06 38 46 74 14." });
  }
});
