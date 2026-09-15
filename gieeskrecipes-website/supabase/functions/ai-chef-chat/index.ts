// ═══════════════════════════════════════════════════════════════
// GieesK Recipes — AI Chef Chat
// ───────────────────────────────────────────────────────────────
// Called directly from the browser (js/ai.js) via:
//   sb.functions.invoke('ai-chef-chat', { body: { message, history } })
//
// Proxies the request to the Claude API so the Anthropic key never
// reaches the client. Requires the ANTHROPIC_API_KEY secret:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Deploy:
//   supabase functions deploy ai-chef-chat
// ═══════════════════════════════════════════════════════════════

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-5';

const CHEF_SYSTEM_PROMPT = `You are the GieesK Recipes AI Chef — a warm, knowledgeable culinary guide
specializing in global home cooking, with deep expertise in the cuisines
featured on the GieesK Recipes platform: Kenyan, Tanzanian, Ethiopian,
Somali, and Italian, alongside general world cuisine.

Your personality:
- Friendly, encouraging, and practical — like a chef mentoring a home cook
- You give clear, actionable advice: ingredient substitutions, technique
  tips, timing, and how to fix a dish that's going wrong
- You celebrate the cultural context and origin of dishes when relevant
- You keep answers focused and concise unless the user asks for detail

Guidelines:
- If asked for a recipe recommendation, ask 1-2 clarifying questions
  (ingredients on hand, dietary needs, time available) before suggesting
- Do not invent specific recipe IDs from the GieesK database — only
  reference a recipe ID if the user has given you one
- Stay in the culinary/cooking domain; politely redirect off-topic
  questions back to cooking`;

// CORS — the browser calls this function directly via sb.functions.invoke
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // TODO: restrict to https://gieesk.com once confirmed stable
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!ANTHROPIC_API_KEY) {
    console.error('[GieesK] ai-chef-chat: missing ANTHROPIC_API_KEY secret');
    return new Response(JSON.stringify({ error: 'AI chef is not configured yet' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const payload = await req.json();
    const message = String(payload.message || '').trim();
    const history = Array.isArray(payload.history) ? (payload.history as ChatMessage[]) : [];

    if (!message) {
      return new Response(JSON.stringify({ error: 'Missing message' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Keep requests small and cheap — last 10 turns of context is plenty
    const trimmedHistory = history.slice(-10).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || ''),
    }));

    const messages = [...trimmedHistory, { role: 'user', content: message }];

    const anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: CHEF_SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('[GieesK] ai-chef-chat: Anthropic API error', anthropicRes.status, errText);
      return new Response(JSON.stringify({ error: 'AI chef is temporarily unavailable' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await anthropicRes.json();
    const reply = (data.content || [])
      .map((block: { type: string; text?: string }) => (block.type === 'text' ? block.text : ''))
      .join('');

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[GieesK] ai-chef-chat threw:', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});