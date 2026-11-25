// GET /functions/v1/instagram-feed → 8 dernières publications du compte Instagram pro.
// Jeton : secret INSTAGRAM_ACCESS_TOKEN (longue durée), rafraîchi chaque semaine par
// gift-card-cron et conservé dans la table app_settings.
import { CORS, db, json } from "../_shared/giftCards.ts";

let cache: { at: number; body: unknown } | null = null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const cacheHeaders = { "Cache-Control": "public, max-age=3600" };
  if (cache && Date.now() - cache.at < 3600e3) return json(200, cache.body, cacheHeaders);
  const { data } = await db().from("app_settings").select("value").eq("key", "instagram_token").maybeSingle();
  const token = data?.value || Deno.env.get("INSTAGRAM_ACCESS_TOKEN");
  if (!token) return json(200, { configured: false }, cacheHeaders);
  try {
    const r = await fetch(`https://graph.instagram.com/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=12&access_token=${encodeURIComponent(token)}`);
    const j = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(j));
    // deno-lint-ignore no-explicit-any
    const posts = (j.data ?? []).map((m: any) => ({
      url: m.permalink, image: m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url,
      caption: (m.caption ?? "").split("\n")[0].slice(0, 120),
    })).filter((m: { image?: string }) => m.image).slice(0, 8);
    const body = { configured: true, posts };
    cache = { at: Date.now(), body };
    return json(200, body, cacheHeaders);
  } catch (e) {
    console.error(e);
    return json(200, { configured: true, error: true }, { "Cache-Control": "public, max-age=300" });
  }
});
