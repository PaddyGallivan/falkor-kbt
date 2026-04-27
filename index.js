// ============================================================
// FALKOR PROJECT WORKER — Template v1
// Lightweight spoke for the Thor Hub-and-Spoke network
// Each project gets one of these, auto-deployed by Thor
// ============================================================
// REQUIRED SECRETS (same as Thor):
//   ANTHROPIC_API_KEY   — Claude AI (use haiku for speed/cost)
//   THOR_URL            — Thor hub URL (https://thor.pgallivan.workers.dev)
//
// OPTIONAL SECRETS (add as needed per project):
//   GOOGLE_SHEETS_TOKEN — Read/write project spreadsheets
//   WHATSAPP_TOKEN      — Send WhatsApp messages
//   WHATSAPP_PHONE_ID   — WhatsApp Business phone ID
//   TELEGRAM_BOT_TOKEN  — Send Telegram notifications
//   PADDY_TG_CHAT_ID    — Paddy's Telegram chat ID
//
// KV BINDING:
//   PROJECT_MEMORY      — Project-specific KV namespace (create one per project)
//
// DEPLOYMENT:
//   Ask Thor: "Create a new project Falkor for [PROJECT_NAME]"
//   Thor will deploy this template with the right PROJECT_NAME and PROJECT_CONTEXT
// ============================================================

// ── Project Identity (Thor sets these when deploying) ──────
const PROJECT_NAME = 'KBT';           // e.g. "KBT", "School", "FamilyComps"
const PROJECT_CONTEXT = 'Kow Brainer Trivia — Paddy\'s professional pub trivia business running weekly events';   // e.g. "Kow Brainer Trivia business"
const THOR_URL = 'https://thor.pgallivan.workers.dev';

const BASE = `You are Falkor-${PROJECT_NAME}, Paddy Gallivan's dedicated AI for ${PROJECT_CONTEXT}.

You are part of the Thor Hub-and-Spoke network:
- Thor is the main hub orchestrator at ${THOR_URL}
- You are a specialist for ${PROJECT_NAME} only
- For complex cross-project decisions, escalate to Thor

Your job:
- Stay heads-down on ${PROJECT_NAME} tasks
- Monitor emails, sheets, tasks relevant to this project
- Flag issues to Paddy proactively — don't wait to be asked
- Handle routine tasks autonomously, escalate only when needed
- Keep your KV memory up to date with project state

Paddy facts:
- PE teacher at Williamstown Primary School
- Runs Kow Brainer Trivia (KBT) trivia business
- Hardcore Western Bulldogs fan — treat this seriously
- Runs family footy tips and racing comps
- Partner: Jack


KBT-specific knowledge:
- Weekly trivia nights at various venues around Melbourne
- Paddy is the host/MC — he writes questions, runs the night, manages scoring
- Typical round structure: 8 rounds, various categories
- Teams of up to 6, entry fee per team
- Scoring tracked in Google Sheets
- Comms to venues and players via email/WhatsApp
- Key tasks: question writing, venue coordination, scoring, payments, promotion

Proactively flag: upcoming events without confirmed venues, overdue payments, unanswered venue emails.

Style: Direct. No hedging. If you can handle it, handle it. If you need Thor, say so and escalate.`;

const TOOLS = [
  {
    name: 'escalate_to_thor',
    description: 'Send a request to Thor (the hub) for complex cross-project tasks or capabilities this worker lacks',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The request to send to Thor' }
      },
      required: ['message']
    }
  },
  {
    name: 'remember',
    description: 'Save something to this project\'s persistent memory',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Memory key' },
        value: { type: 'string', description: 'Value to store' }
      },
      required: ['key', 'value']
    }
  },
  {
    name: 'recall',
    description: 'Read from this project\'s persistent memory',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Memory key to retrieve' }
      },
      required: ['key']
    }
  },
  {
    name: 'http_fetch',
    description: 'Make an HTTP request to any URL (GET or POST)',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], default: 'GET' },
        headers: { type: 'object' },
        body: { type: 'string' }
      },
      required: ['url']
    }
  },
  {
    name: 'send_notification',
    description: 'Send a notification to Paddy via Telegram or WhatsApp',
    input_schema: {
      type: 'object',
      properties: {
        channel: { type: 'string', enum: ['telegram', 'whatsapp'], description: 'Which channel to use' },
        message: { type: 'string', description: 'Message to send' }
      },
      required: ['channel', 'message']
    }
  }
];

// ── Chat history store ────────────────────────────────────
const histories = new Map();

async function runTools(toolName, toolInput, env) {
  switch (toolName) {

    case 'escalate_to_thor': {
      try {
        const r = await fetch(`${env.THOR_URL || THOR_URL}/ask`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: `[From Falkor-${PROJECT_NAME}] ${toolInput.message}` })
        });
        const data = await r.json();
        return data.reply || 'Thor responded but no reply field found.';
      } catch (e) {
        return `Failed to reach Thor: ${e.message}`;
      }
    }

    case 'remember': {
      if (!env.PROJECT_MEMORY) return 'No PROJECT_MEMORY KV binding configured.';
      await env.PROJECT_MEMORY.put(toolInput.key, toolInput.value);
      return `Saved: ${toolInput.key}`;
    }

    case 'recall': {
      if (!env.PROJECT_MEMORY) return 'No PROJECT_MEMORY KV binding configured.';
      const val = await env.PROJECT_MEMORY.get(toolInput.key);
      return val !== null ? val : `Nothing stored for key: ${toolInput.key}`;
    }

    case 'http_fetch': {
      try {
        const opts = {
          method: toolInput.method || 'GET',
          headers: toolInput.headers || {}
        };
        if (toolInput.body) opts.body = toolInput.body;
        const r = await fetch(toolInput.url, opts);
        const text = await r.text();
        return text.slice(0, 3000);
      } catch (e) {
        return `HTTP error: ${e.message}`;
      }
    }

    case 'send_notification': {
      if (toolInput.channel === 'telegram') {
        if (!env.TELEGRAM_BOT_TOKEN || !env.PADDY_TG_CHAT_ID) return 'Telegram not configured.';
        const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: env.PADDY_TG_CHAT_ID, text: `[${PROJECT_NAME}] ${toolInput.message}`, parse_mode: 'Markdown' })
        });
        const d = await r.json();
        return d.ok ? 'Telegram sent ✅' : `Telegram error: ${JSON.stringify(d)}`;
      }
      if (toolInput.channel === 'whatsapp') {
        if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_ID) return 'WhatsApp not configured.';
        const r = await fetch(`https://graph.facebook.com/v17.0/${env.WHATSAPP_PHONE_ID}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.WHATSAPP_TOKEN}` },
          body: JSON.stringify({ messaging_product: 'whatsapp', to: env.PADDY_PHONE || '', type: 'text', text: { body: `[${PROJECT_NAME}] ${toolInput.message}` } })
        });
        const d = await r.json();
        return d.messages ? 'WhatsApp sent ✅' : `WhatsApp error: ${JSON.stringify(d)}`;
      }
      return 'Unknown channel';
    }

    default:
      return `Unknown tool: ${toolName}`;
  }
}

async function askAI(message, history, env) {
  const messages = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message }
  ];

  let response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: BASE,
      tools: TOOLS,
      messages
    })
  });

  let data = await response.json();
  let iterations = 0;

  while (data.stop_reason === 'tool_use' && iterations < 10) {
    iterations++;
    const assistantMsg = { role: 'assistant', content: data.content };
    messages.push(assistantMsg);

    const toolResults = [];
    for (const block of data.content) {
      if (block.type === 'tool_use') {
        const result = await runTools(block.name, block.input, env);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: String(result) });
      }
    }
    messages.push({ role: 'user', content: toolResults });

    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system: BASE,
        tools: TOOLS,
        messages
      })
    });
    data = await response.json();
  }

  const reply = data.content?.find(b => b.type === 'text')?.text || 'No response.';
  return reply;
}

// ── Simple Chat UI ────────────────────────────────────────
const UI = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Falkor — KBT</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #060b18; color: #e0e6f0; height: 100vh; display: flex; flex-direction: column; }
  header { background: #0d1628; padding: 16px 20px; border-bottom: 1px solid #1e2d4a; display: flex; align-items: center; gap: 12px; }
  header h1 { font-size: 18px; font-weight: 600; }
  header .badge { background: #1a3a6b; color: #60a5fa; padding: 3px 10px; border-radius: 20px; font-size: 12px; }
  #chat { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
  .msg { max-width: 75%; padding: 12px 16px; border-radius: 16px; line-height: 1.5; font-size: 14px; white-space: pre-wrap; }
  .user { background: #1a3a6b; align-self: flex-end; border-bottom-right-radius: 4px; }
  .assistant { background: #0d1628; border: 1px solid #1e2d4a; align-self: flex-start; border-bottom-left-radius: 4px; }
  form { display: flex; gap: 10px; padding: 16px 20px; background: #0d1628; border-top: 1px solid #1e2d4a; }
  input { flex: 1; background: #060b18; border: 1px solid #1e2d4a; color: #e0e6f0; padding: 12px 16px; border-radius: 24px; font-size: 14px; outline: none; }
  input:focus { border-color: #3b82f6; }
  button { background: #2563eb; color: white; border: none; padding: 12px 20px; border-radius: 24px; cursor: pointer; font-size: 14px; font-weight: 500; }
  button:hover { background: #1d4ed8; }
  .typing { opacity: 0.5; font-style: italic; }
</style>
</head>
<body>
<header>
  <div>🐕</div>
  <h1>Falkor</h1>
  <div class="badge">${PROJECT_NAME}</div>
</header>
<div id="chat">
  <div class="msg assistant">Hey! I'm your dedicated Falkor for <strong>${PROJECT_NAME}</strong>. What do you need?</div>
</div>
<form id="f">
  <input id="inp" placeholder="Ask me anything about ${PROJECT_NAME}..." autocomplete="off" />
  <button type="submit">Send</button>
</form>
<script>
const chat = document.getElementById('chat');
const inp = document.getElementById('inp');
let sessionId = Math.random().toString(36).slice(2);

document.getElementById('f').onsubmit = async (e) => {
  e.preventDefault();
  const msg = inp.value.trim();
  if (!msg) return;
  inp.value = '';

  chat.innerHTML += \`<div class="msg user">\${msg}</div>\`;
  const typing = document.createElement('div');
  typing.className = 'msg assistant typing';
  typing.textContent = 'Thinking...';
  chat.appendChild(typing);
  chat.scrollTop = chat.scrollHeight;

  try {
    const r = await fetch('/ask', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({message: msg, sessionId})
    });
    const d = await r.json();
    typing.className = 'msg assistant';
    typing.textContent = d.reply || 'No response.';
  } catch(e) {
    typing.className = 'msg assistant';
    typing.textContent = 'Error: ' + e.message;
  }
  chat.scrollTop = chat.scrollHeight;
};
</script>
</body>
</html>`;

export default {
  async fetch(request, env) {
  const _pu=new URL(request.url);if(_pu.pathname==="/ping")return new Response(JSON.stringify({ok:true,worker:"falkor-kbt",ts:new Date().toISOString()}),{headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}});

    const url = new URL(request.url);

    // Get bot info
    if (url.pathname === '/bot-info' && request.method === 'GET') {
      if (!env.TELEGRAM_BOT_TOKEN) return new Response(JSON.stringify({error: 'No token'}), {headers:{'Content-Type':'application/json'}});
      const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`);
      const d = await r.json();
      return new Response(JSON.stringify(d.result || d), {headers:{'Content-Type':'application/json'}});
    }

    // Force-get updates: temporarily remove webhook, pull getUpdates, re-set webhook
    if (url.pathname === '/force-updates' && request.method === 'GET') {
      if (!env.TELEGRAM_BOT_TOKEN) return new Response(JSON.stringify({error: 'No token'}), {headers:{'Content-Type':'application/json'}});
      const webhookUrl = `https://falkor-kbt.pgallivan.workers.dev/tg-capture`;
      // 1. Delete webhook
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/deleteWebhook`);
      // 2. Get updates
      const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getUpdates?limit=50&allowed_updates=["message"]`);
      const d = await r.json();
      // 3. Re-set webhook
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
      const chatIds = (d.result || []).map(u => ({
        chatId: u.message?.chat?.id,
        name: u.message?.chat?.first_name,
        username: u.message?.chat?.username,
        text: u.message?.text?.substring(0, 40)
      })).filter(u => u.chatId);
      return new Response(JSON.stringify({ok: d.ok, chatIds, total: d.result?.length || 0}), {headers:{'Content-Type':'application/json'}});
    }

    // Try to get chat ID by Telegram username
    if (url.pathname === '/find-paddy' && request.method === 'GET') {
      if (!env.TELEGRAM_BOT_TOKEN) return new Response(JSON.stringify({error: 'No token'}), {headers:{'Content-Type':'application/json'}});
      const username = url.searchParams.get('username') || 'pgallivan';
      const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getChat?chat_id=@${username}`);
      const d = await r.json();
      if (d.ok) {
        const chatId = String(d.result.id);
        // Set on all Thunder workers if we have CF_API_TOKEN
        const CF_ACCOUNT = 'a6f47c17811ee2f8b6caeb8f38768c20';
        const workers = ['thunder-dispatch', 'thunder-dev', 'thunder-watch', 'thunder-revenue', 'thunder-inbox'];
        if (env.CF_API_TOKEN) {
          for (const worker of workers) {
            await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/workers/scripts/${worker}/secrets`, {
              method: 'PUT',
              headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: 'PADDY_TG_CHAT_ID', text: chatId, type: 'secret_text' })
            });
          }
        }
        return new Response(JSON.stringify({found: true, chatId, name: d.result.first_name, username: d.result.username}), {headers:{'Content-Type':'application/json'}});
      }
      return new Response(JSON.stringify({found: false, error: d.description}), {headers:{'Content-Type':'application/json'}});
    }

    // Set Telegram webhook to the capture endpoint
    if (url.pathname === '/activate-capture' && request.method === 'POST') {
      if (!env.TELEGRAM_BOT_TOKEN) return new Response(JSON.stringify({error: 'No bot token'}), {headers:{'Content-Type':'application/json'}});
      const webhookUrl = `https://falkor-kbt.pgallivan.workers.dev/tg-capture`;
      const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl })
      });
      const d = await r.json();
      return new Response(JSON.stringify({ webhook_set: d.ok, result: d.description, url: webhookUrl }), {headers:{'Content-Type':'application/json'}});
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', project: PROJECT_NAME, version: '1.0' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Chat UI
    if (url.pathname === '/' || url.pathname === '') {
      return new Response(UI, { headers: { 'Content-Type': 'text/html' } });
    }

    // AI endpoint
    if (url.pathname === '/ask' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return new Response('Bad JSON', { status: 400 }); }

      const message = body.message?.trim();
      if (!message) return new Response(JSON.stringify({ error: 'No message' }), { status: 400 });

      const sessionId = body.sessionId || 'default';
      if (!histories.has(sessionId)) histories.set(sessionId, []);
      const history = histories.get(sessionId);

      if (!env.ANTHROPIC_API_KEY) {
        return new Response(JSON.stringify({ reply: '⚠️ ANTHROPIC_API_KEY not configured. Add it in CF Worker settings.' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      try {
        const reply = await askAI(message, history, env);
        history.push({ role: 'user', content: message });
        history.push({ role: 'assistant', content: reply });
        if (history.length > 40) history.splice(0, 2);

        return new Response(JSON.stringify({ reply }), { headers: { 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ reply: `Error: ${e.message}` }), { headers: { 'Content-Type': 'application/json' } });
      }
    }

    // Telegram webhook — capture chat ID and set on Thunder workers
    if (url.pathname === '/tg-capture' && request.method === 'POST') {
      const update = await request.json().catch(() => ({}));
      const chatId = update.message?.chat?.id || update.message?.from?.id;
      const name = update.message?.from?.first_name || 'Paddy';
      if (chatId && env.CF_API_TOKEN && env.TELEGRAM_BOT_TOKEN) {
        const CF_ACCOUNT = 'a6f47c17811ee2f8b6caeb8f38768c20';
        const workers = ['thunder-dispatch', 'thunder-dev', 'thunder-watch', 'thunder-revenue', 'thunder-inbox'];
        let ok = 0;
        for (const worker of workers) {
          const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/workers/scripts/${worker}/secrets`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'PADDY_TG_CHAT_ID', text: String(chatId), type: 'secret_text' })
          });
          const d = await r.json();
          if (d.success) ok++;
        }
        // Reply via Telegram
        await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: `✅ Got it ${name}! Chat ID ${chatId} set on ${ok}/5 Thunder workers. ⚡ Network is fully armed!` })
        });
      }
      return new Response('OK');
    }

    // Get recent Telegram updates to find Paddy's chat ID
    if (url.pathname === '/get-chat-id' && request.method === 'GET') {
      if (!env.TELEGRAM_BOT_TOKEN) return new Response(JSON.stringify({error: 'No bot token'}), {headers:{'Content-Type':'application/json'}});
      const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getUpdates?limit=20`);
      const d = await r.json();
      const chatIds = (d.result || []).map(u => ({
        chatId: u.message?.chat?.id || u.channel_post?.chat?.id,
        name: u.message?.chat?.first_name || u.message?.chat?.username || u.channel_post?.chat?.title,
        text: u.message?.text?.substring(0, 30)
      })).filter(u => u.chatId);
      return new Response(JSON.stringify({chatIds, ok: d.ok}), {headers:{'Content-Type':'application/json'}});
    }

    // One-shot: set PADDY_TG_CHAT_ID + SUPABASE_ANON_KEY on Thunder workers
    if (url.pathname === '/seed-tg-secret' && request.method === 'POST') {
      const CF_ACCOUNT = 'a6f47c17811ee2f8b6caeb8f38768c20';
      const workers = ['thunder-dispatch', 'thunder-dev', 'thunder-watch', 'thunder-revenue', 'thunder-inbox'];
      const results = [];
      for (const worker of workers) {
        // Set PADDY_TG_CHAT_ID
        if (env.PADDY_TG_CHAT_ID && env.CF_API_TOKEN) {
          const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/workers/scripts/${worker}/secrets`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'PADDY_TG_CHAT_ID', text: env.PADDY_TG_CHAT_ID, type: 'secret_text' })
          });
          const d = await r.json();
          results.push(d.success ? `✅ ${worker}/PADDY_TG_CHAT_ID` : `❌ ${worker}/PADDY_TG_CHAT_ID: ${JSON.stringify(d.errors)}`);
        } else {
          results.push(`⚠️ ${worker}/PADDY_TG_CHAT_ID: missing on this worker`);
        }
        // Set SUPABASE_ANON_KEY on thunder-dev
        if (worker === 'thunder-dev' && env.SUPABASE_ANON_KEY && env.CF_API_TOKEN) {
          const r2 = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/workers/scripts/thunder-dev/secrets`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'SUPABASE_ANON_KEY', text: env.SUPABASE_ANON_KEY, type: 'secret_text' })
          });
          const d2 = await r2.json();
          results.push(d2.success ? `✅ thunder-dev/SUPABASE_ANON_KEY` : `❌ thunder-dev/SUPABASE_ANON_KEY`);
        }
      }
      return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response('Not found', { status: 404 });
  }
};

// (already handled in the body)
// This line intentionally blank