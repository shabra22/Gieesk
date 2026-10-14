// supabase/functions/moderate-media/index.ts                 NOT DEPLOYED YET
//
// Server-side check of uploaded pictures. Read MODERATION-SETUP.md first.
//
// A Supabase Database Webhook calls this whenever a post is saved
// (community_posts) or a profile picture changes (profiles). The function
// fetches the picture, asks Claude whether it shows nudity, sexual content,
// a minor in a sexual context or graphic violence, and if so:
//   · a post  → is put on hold (hidden everywhere; see supabase-content-moderation.sql)
//   · an avatar → is removed from the profile
//
// What it checks: post.image_url, post.poster_url (the video's cover) and
// profiles.avatar_url. It cannot watch a video file: Edge Functions cannot
// decode video. The cover is a frame taken from the video by the app, so it
// is a useful check, not a complete one — see "Videos" in the setup guide for
// the options when you want the whole video analysed.
//
// It fails open: if the picture cannot be fetched or the AI call fails, the
// upload stays as it is and the failure is logged. Reports still apply.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@^2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const WEBHOOK_SECRET = Deno.env.get("MODERATION_WEBHOOK_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const MODEL = Deno.env.get("MODERATION_MODEL") ?? "claude-haiku-4-5";
const MAX_BYTES = 5 * 1024 * 1024;
const OK_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

const PROMPT = `You are a content-safety checker for a cooking and recipe community app.
Look at the picture and answer with ONE line of JSON and nothing else:
{"sexual":"none|suggestive|explicit","minor_sexualised":false,"graphic_violence":false}
- "explicit": nudity or sexual acts.
- "suggestive": revealing or sexualised, but not explicit.
- "minor_sexualised": true if a child or someone who appears to be under 18 is nude or in a sexual context.
- "graphic_violence": true for gore, serious injury or cruelty. Ordinary food preparation (raw meat, butchering, blood in a steak) is NOT violence.
Food, kitchens, people cooking, and people eating are normal. Be conservative with food: raw chicken, sausages or peaches are not nudity.`;

interface Verdict { sexual: "none" | "suggestive" | "explicit"; minor_sexualised: boolean; graphic_violence: boolean }

const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Only pictures in this project's own public storage. Without this check
// anyone who could write a URL into a row could make the function fetch it.
function isOurs(url: unknown): url is string {
  return typeof url === "string" && url.startsWith(`${SUPABASE_URL}/storage/v1/object/public/`);
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function judge(url: string): Promise<Verdict | null> {
  const res = await fetch(url);
  if (!res.ok) { console.warn("fetch failed", res.status, url); return null; }
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!OK_TYPES.includes(type)) { console.warn("not a checkable image", type); return null; }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) { console.warn("image too large to check", bytes.length); return null; }

  const ai = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 100,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: type, data: toBase64(bytes) } },
        { type: "text", text: PROMPT },
      ] }],
    }),
  });
  if (!ai.ok) { console.warn("AI call failed", ai.status, (await ai.text()).slice(0, 200)); return null; }
  const out = await ai.json();
  const text: string = out?.content?.[0]?.text ?? "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) { console.warn("unreadable verdict", text.slice(0, 120)); return null; }
  try { return JSON.parse(m[0]) as Verdict; } catch { return null; }
}

function problem(v: Verdict): string | null {
  if (v.minor_sexualised) return "minor";
  if (v.sexual === "explicit") return "explicit";
  if (v.graphic_violence) return "violence";
  return null;   // "suggestive" is left to reports; it is often a swimsuit or a chef's apron photo
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!ANTHROPIC_API_KEY || !WEBHOOK_SECRET) return json({ error: "Not configured" }, 500);
  if (req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) return json({ error: "Forbidden" }, 403);

  let payload: { type?: string; table?: string; record?: Record<string, unknown>; old_record?: Record<string, unknown> | null };
  try { payload = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const rec = payload.record ?? {};
  const old = payload.old_record ?? {};

  // ── A post: its photo and its video cover ─────────────────────
  if (payload.table === "community_posts") {
    if (rec.moderation_hold) return json({ skipped: "already on hold" });
    const urls = ["image_url", "poster_url"]
      .filter((k) => isOurs(rec[k]) && rec[k] !== old[k])
      .map((k) => rec[k] as string);
    for (const url of urls) {
      const v = await judge(url);
      const why = v ? problem(v) : null;
      if (why) {
        await admin.from("community_posts").update({
          moderation_hold: true, moderation_reason: `AI: ${why}`, moderated_at: new Date().toISOString(), status: "draft",
        }).eq("id", rec.id);
        await admin.from("moderation_log").insert({ post_id: rec.id, action: "hold", source: "ai", reason: why });
        return json({ held: true, why });
      }
    }
    return json({ held: false, checked: urls.length });
  }

  // ── A profile picture ─────────────────────────────────────────
  if (payload.table === "profiles") {
    if (!isOurs(rec.avatar_url) || rec.avatar_url === old.avatar_url) return json({ skipped: "no new picture" });
    const v = await judge(String(rec.avatar_url));
    const why = v ? problem(v) : null;
    if (why) {
      await admin.from("profiles").update({ avatar_url: null }).eq("id", rec.id);
      console.warn("avatar removed", rec.id, why);
      return json({ removed: true, why });
    }
    return json({ removed: false });
  }

  return json({ skipped: "unknown table" });
});
