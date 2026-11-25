// GET /functions/v1/google-reviews → note + derniers avis Google de l'institut.
// Secrets : GOOGLE_PLACES_API_KEY, GOOGLE_PLACE_ID. Mis en cache 12 h par le navigateur/CDN.
import { CORS, json } from "../_shared/giftCards.ts";

let cache: { at: number; body: unknown } | null = null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const cacheHeaders = { "Cache-Control": "public, max-age=43200" };
  const key = Deno.env.get("GOOGLE_PLACES_API_KEY"), id = Deno.env.get("GOOGLE_PLACE_ID");
  if (!key || !id) return json(200, { configured: false }, cacheHeaders);
  if (cache && Date.now() - cache.at < 6 * 3600e3) return json(200, cache.body, cacheHeaders);
  try {
    const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?languageCode=fr`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "rating,userRatingCount,googleMapsUri,reviews" },
    });
    if (!r.ok) throw new Error(`Places API ${r.status}`);
    const p = await r.json();
    // deno-lint-ignore no-explicit-any
    const reviews = (p.reviews ?? []).map((v: any) => ({
      author: v.authorAttribution?.displayName, authorUrl: v.authorAttribution?.uri, rating: v.rating,
      text: v.text?.text || v.originalText?.text || "", when: v.relativePublishTimeDescription,
    })).filter((v: { text: string }) => v.text);
    const body = { configured: true, rating: p.rating, count: p.userRatingCount, url: p.googleMapsUri, reviews };
    cache = { at: Date.now(), body };
    return json(200, body, cacheHeaders);
  } catch (e) {
    console.error(e);
    return json(200, { configured: true, error: true }, { "Cache-Control": "public, max-age=600" });
  }
});
