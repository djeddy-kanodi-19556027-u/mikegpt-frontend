/* =====================================================
   MIKEgpt backend: Express + OpenAI
   Run:  node server.js        (inside the mikegpt-backend folder)

   .env needs:   OPENAI_API_KEY=sk-...
   optional:     OPENAI_MODEL=some-model-name   (forces one model)
                 PORT=3000

   NOTE: OpenAI model names change often (older ones get
   shut down). So instead of hard-coding one name, the
   server asks OpenAI which models your key can use and
   picks a good, affordable one. If one fails, it tries
   the next.
   ===================================================== */
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = (process.env.OPENAI_API_KEY || '').trim();
const BASE = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const FORCED_MODEL = (process.env.OPENAI_MODEL || '').trim();

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const SYSTEM_PROMPT = `You are MIKEgpt, a friendly and capable AI assistant inside a chat website.
- Answer every question clearly and efficiently. Be concise by default; go deeper only when asked.
- Reply in the same language the user writes in (English, French, Wolof, ...).
- Use Markdown when it helps: short paragraphs, bullet lists, tables, and fenced code blocks with the language name.
- If you are not sure about something, say so instead of inventing facts.`;

const authHeaders = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` });

/* ---------- 1. Friendly errors ---------- */
function makeError(status, g) {
  const msg = (g && g.message) || '';
  const code = (g && g.code) || '';
  let text;
  let fatal = false;
  if (status === 401 || code === 'invalid_api_key') {
    text = 'Your OpenAI API key is not valid. Check OPENAI_API_KEY in the .env file (no quotes, no spaces), then restart the server.';
    fatal = true;
  } else if (code === 'insufficient_quota') {
    text = 'Your OpenAI account has no credit left. The API is billed separately from ChatGPT: open your OpenAI account, go to Billing, and add credit. Then try again.';
    fatal = true;
  } else if (code === 'unsupported_country_region_territory') {
    text = 'OpenAI says its API is not available in your country or region.';
    fatal = true;
  } else if (status === 429) {
    text = 'Too many requests right now. Wait a few seconds and try again.';
  } else if (status === 403) {
    text = 'OpenAI refused this request (403). ' + msg;
    fatal = true;
  } else if (status >= 500) {
    text = 'OpenAI is busy right now. Please try again in a moment.';
  } else {
    text = msg || `OpenAI returned an error (${status}).`;
  }
  const e = new Error(text);
  e.status = status;
  e.fatal = fatal;
  return e;
}

/* ---------- 2. Find the models that work for this key ---------- */
async function listModels() {
  const r = await fetch(`${BASE}/models`, { headers: authHeaders(), signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw makeError(r.status, j.error);
  return (j.data || []).map((m) => m.id);
}

function rankModels(ids) {
  const usable = ids
    .filter((id) => /^gpt-\d/.test(id))
    // leave out everything that is not plain text chat
    .filter((id) => !/(image|audio|realtime|tts|transcribe|search|codex|embedding|moderation|instruct|deep-research|chat-latest|-pro|preview|oss|dall|whisper|computer)/i.test(id))
    .filter((id) => !/-\d{4}-\d{2}-\d{2}$/.test(id));          // skip dated snapshots, prefer the plain name

  const version = (id) => parseFloat((id.match(/^gpt-(\d+(?:\.\d+)?)/) || [])[1] || 0);
  // affordable "balanced" models first, the biggest (and priciest) last
  const tier = (id) =>
    /(mini|terra)/.test(id) ? 3 :
    /luna/.test(id) ? 2 :
    /nano/.test(id) ? 1 : 0;
  const score = (id) => tier(id) * 1000 + version(id) * 10;
  return [...new Set(usable)].sort((a, b) => score(b) - score(a));
}

let cachedOrder = null;
let cachedAt = 0;
async function getModelOrder(force = false) {
  if (!force && cachedOrder && Date.now() - cachedAt < 30 * 60 * 1000) return cachedOrder;
  const ranked = rankModels(await listModels());
  cachedOrder = FORCED_MODEL ? [FORCED_MODEL, ...ranked.filter((n) => n !== FORCED_MODEL)] : ranked;
  cachedAt = Date.now();
  if (!cachedOrder.length) throw makeError(404, { message: 'Your key has no chat models available.' });
  return cachedOrder;
}

/* ---------- 3. Build the conversation ---------- */
function buildMessages(message, history) {
  const turns = [];
  const add = (role, text) => {
    text = String(text || '').trim();
    if (!text) return;
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += '\n\n' + text;
    else turns.push({ role, content: text });
  };
  (Array.isArray(history) ? history.slice(-20) : []).forEach((h) => {
    if (!h) return;
    const role = h.role === 'user' ? 'user' : (h.role === 'model' || h.role === 'assistant' || h.role === 'bot') ? 'assistant' : null;
    if (role) add(role, h.text);
  });
  add('user', message);
  return turns;
}

/* ---------- 4. Ask OpenAI ----------
   Newer models use the "Responses" endpoint; older ones the
   "Chat Completions" endpoint. We try Responses first and fall
   back to Chat Completions for the same model. */
function textFromResponses(data) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const parts = [];
  for (const item of data.output || []) {
    if (item.type !== 'message') continue;
    for (const c of item.content || []) {
      if (c.type === 'output_text' && c.text) parts.push(c.text);
      else if (c.type === 'refusal' && c.refusal) parts.push(c.refusal);
    }
  }
  return parts.join('').trim();
}

async function viaResponses(model, turns) {
  const r = await fetch(`${BASE}/responses`, {
    method: 'POST',
    headers: authHeaders(),
    signal: AbortSignal.timeout(90000),
    body: JSON.stringify({ model, instructions: SYSTEM_PROMPT, input: turns, store: false }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw makeError(r.status, data.error);
  return textFromResponses(data);
}

async function viaChatCompletions(model, turns) {
  const r = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: authHeaders(),
    signal: AbortSignal.timeout(90000),
    body: JSON.stringify({ model, messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...turns] }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw makeError(r.status, data.error);
  const m = data.choices && data.choices[0] && data.choices[0].message;
  return String((m && (m.content || m.refusal)) || '').trim();
}

let announced = '';
async function askOpenAI(message, history) {
  const turns = buildMessages(message, history);
  let order = await getModelOrder();
  let lastErr = null;

  for (let pass = 0; pass < 2; pass++) {
    for (const model of order.slice(0, 4)) {
      for (const via of [viaResponses, viaChatCompletions]) {
        try {
          const text = await via(model, turns);
          if (announced !== model) { announced = model; console.log(`Using model: ${model}`); }
          return text || "I didn't get an answer from the AI. Please try again.";
        } catch (e) {
          lastErr = e;
          console.log(`${model} (${via === viaResponses ? 'responses' : 'chat'}) failed ${e.status}: ${e.message}`);
          if (e.fatal) throw e;                              // bad key, no credit...: stop right away
          if (e.status !== 400 && e.status !== 404) break;   // only try the other endpoint when this one doesn't fit the model
        }
      }
    }
    if (pass === 0) {                                        // the model list may be out of date: refresh it and try once more
      try { order = await getModelOrder(true); } catch { break; }
    }
  }
  throw lastErr || new Error('No model answered.');
}

/* ---------- 5. Routes ---------- */
app.post('/api/chat', async (req, res) => {
  const message = String((req.body && req.body.message) || '').trim();
  if (!message) return res.status(400).json({ error: 'Message is required' });
  if (!API_KEY) {
    return res.status(500).json({ error: 'No OpenAI API key yet. Add OPENAI_API_KEY=sk-... to the .env file, then restart the server.' });
  }
  try {
    const reply = await askOpenAI(message, req.body.history);
    res.json({ reply });
  } catch (err) {
    console.error('Chat error:', err.message);
    const code = err.status >= 400 && err.status < 600 ? err.status : 500;
    res.status(code).json({ error: err.message || 'Something went wrong on the server.' });
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true, hasKey: Boolean(API_KEY), model: announced || null }));

if (require.main === module) {
  app.listen(PORT, async () => {
    console.log(`MIKEgpt backend running at http://localhost:${PORT}`);
    if (!API_KEY) { console.log('⚠  OPENAI_API_KEY is missing in your .env file.'); return; }
    try {
      const order = await getModelOrder(true);
      console.log('Models I will try, in order:', order.slice(0, 4).join(', '));
    } catch (e) {
      console.log('Could not check your models:', e.message);
    }
  });
}

module.exports = { app, askOpenAI, rankModels, buildMessages };