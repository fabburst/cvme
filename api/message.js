// api/message.js — Sessions + messages (un seul Lambda = un seul store)
const crypto = require('crypto');

if (!global._cvme) global._cvme = new Map();
const store = global._cvme;

const TTL      = 10 * 60 * 1000;
const CHARS    = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_MSGS = 50;

function generateCode() {
  let code;
  do {
    const a = Array.from({length:3}, () => CHARS[crypto.randomInt(CHARS.length)]).join('');
    const b = Array.from({length:3}, () => CHARS[crypto.randomInt(CHARS.length)]).join('');
    code = `${a}-${b}`;
  } while (store.has(code));
  return code;
}

function cleanup() {
  const now = Date.now();
  for (const [k, v] of store.entries())
    if (now - v.createdAt > TTL) store.delete(k);
}

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  cleanup();

  const code  = (req.query.code || '').toUpperCase();
  const from  = req.query.from;
  const since = parseInt(req.query.since || '0');

  // ── CRÉER UNE SESSION : POST /api/message (sans code) ──────────────────────
  if (req.method === 'POST' && !code) {
    const newCode = generateCode();
    store.set(newCode, {
      createdAt: Date.now(),
      peerConnected: false,
      forHost: [],   // messages envoyés par le peer → reçus par le host
      forPeer: []    // messages envoyés par le host → reçus par le peer
    });
    return res.json({ code: newCode, ttl: TTL });
  }

  // ── VÉRIFIER SESSION : GET /api/message?code=X (sans from) ─────────────────
  if (req.method === 'GET' && code && !from) {
    const session = store.get(code);
    if (!session) return res.status(404).json({ error: 'invalid or expired code' });
    session.peerConnected = true;
    return res.json({ ok: true, age: Date.now() - session.createdAt });
  }

  if (!code) return res.status(400).json({ error: 'missing code' });
  const session = store.get(code);
  if (!session) return res.status(404).json({ error: 'invalid or expired code' });

  // ── ENVOYER UN MESSAGE : POST /api/message?code=X&from=host|peer ───────────
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { payload, type } = JSON.parse(body);
        const key = from === 'host' ? 'forPeer' : 'forHost';
        const msg = { payload, ts: Date.now(), type: type || 'text' };
        session[key].push(msg);
        if (session[key].length > MAX_MSGS) session[key].shift();
        if (from === 'peer') session.peerConnected = true;
        res.json({ ok: true });
      } catch(e) {
        res.status(400).json({ error: 'bad json' });
      }
    });
    return;
  }

  // ── POLL : GET /api/message?code=X&from=host|peer&since=ts ─────────────────
  if (req.method === 'GET') {
    const key  = from === 'host' ? 'forHost' : 'forPeer';
    const msgs = session[key].filter(m => m.ts > since);
    return res.json({
      messages: msgs,
      peerConnected: !!session.peerConnected
    });
  }

  // ── FERMER SESSION : DELETE /api/message?code=X ─────────────────────────────
  if (req.method === 'DELETE') {
    store.delete(code);
    return res.json({ ok: true });
  }

  res.status(405).end();
};
