// supabase/functions/ai-chef-chat/index.ts
// AI Chef chat handler — proxies chat messages to the Claude API

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@^2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6"; // swap to a smaller/cheaper model later if you want

const CHEF_SYSTEM_PROMPT = `You are the GieesK Recipes AI Chef — a warm, knowledgeable culinary guide
specializing in global home cooking, with deep expertise in African cuisines
(Kenyan, Tanzanian, Ethiopian) as well as Italian and other world cuisines
featured on the GieesK Recipes platform.

Your personality:
- Friendly, encouraging, and practical — like a chef mentoring a home cook
- You give clear, actionable advice: ingredient substitutions, technique tips,
  timing, and how to fix a dish that's going wrong
- You celebrate the cultural context and origin of dishes when relevant
- You keep answers focused and not overly long unless the user asks for detail

Guidelines:
- If asked about a recipe on the platform, help the user with technique,
  substitutions, or serving suggestions
- If asked for a recipe recommendation, ask 1-2 clarifying questions
  (ingredients on hand, dietary needs, time available) before suggesting
- Do not invent specific recipe IDs from the GieesK database — only reference
  a recipe ID if the user has told you one
- Stay in the culinary/cooking domain; politely redirect off-topic questions
  back to cooking`;

// CORS headers — adjust origin to your actual domain in production
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // TODO: restrict to https://gieesk.com in production
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// AI Chef is a paid feature, and this function holds the Anthropic key —
// so it has to check for itself who is calling. Before this, any request
// to this URL got a full Claude answer, subscription or not.
async function checkAccess(req: Request): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, status: 401, error: "Please sign in to use the AI Chef" };

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // An anon key in this header is not a signed-in person: getUser rejects it.
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return { ok: false, status: 401, error: "Please sign in to use the AI Chef" };

  const { data: profile } = await admin
    .from("profiles")
    .select("is_premium, premium_until")
    .eq("id", data.user.id)
    .maybeSingle();

  const until = profile?.premium_until ? new Date(profile.premium_until) : null;
  const active = !!profile?.is_premium && (!until || until > new Date());
  if (!active) return { ok: false, status: 402, error: "AI Chef is part of Gieesk Pro" };

  return { ok: true, userId: data.user.id };
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface RequestBody {
  message: string;
  history?: ChatMessage[]; // optional prior turns for context
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "Server misconfiguration: missing API key" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const access = await checkAccess(req);
  if (!access.ok) {
    return new Response(
      JSON.stringify({ error: access.error }),
      { status: access.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const body: RequestBody = await req.json();
    const { message, history = [] } = body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'message' field" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cap history length to keep requests small and cheap
    const trimmedHistory = history.slice(-10);

    const messages = [
      ...trimmedHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: message },
    ];

    const anthropicResponse = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: CHEF_SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      console.error("Anthropic API error:", anthropicResponse.status, errText);
      return new Response(
        JSON.stringify({ error: "AI chef is temporarily unavailable" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await anthropicResponse.json();
    const reply = data.content
      ?.map((block: { type: string; text?: string }) =>
        block.type === "text" ? block.text : ""
      )
      .join("") ?? "";

    return new Response(
      JSON.stringify({ reply }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("ai-chef-chat error:", err);
    return new Response(
      JSON.stringify({ error: "Something went wrong processing your request" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});