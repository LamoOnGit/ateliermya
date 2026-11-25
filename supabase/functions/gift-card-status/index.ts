// GET /functions/v1/gift-card-status?ref=<public_token>
// Utilisé par la page de confirmation. Le jeton (UUID aléatoire) n'est connu que de
// l'acheteuse (URL de retour Stripe et email) : il ne permet ni de lister ni de deviner les cartes.
import { CORS, db, json, publicCard } from "../_shared/giftCards.ts";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const ref = new URL(req.url).searchParams.get("ref") ?? "";
  if (!UUID.test(ref)) return json(400, { error: "Référence invalide." });
  try {
    const { data } = await db().from("gift_cards").select("*").eq("public_token", ref).maybeSingle();
    if (!data) return json(404, { error: "Carte introuvable." });
    if (data.status === "pending") return json(200, { status: "pending" });
    if (data.status === "cancelled") return json(200, { status: "cancelled" });
    return json(200, publicCard(data));
  } catch (e) {
    console.error(e);
    return json(500, { error: "Erreur serveur." });
  }
});
