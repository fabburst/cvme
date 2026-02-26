// api/message.js — Gère à la fois les sessions ET les messages
// (un seul fichier = un seul Lambda = un seul store global partagé)

const crypto = require('crypto');

if (!global._cvme) global._cvme = new Map();
const store = global._cvme;

const TTL   = 10 * 60 * 1000;
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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

  const code = (req.query.code || '').toUpperCase();
  const from  = req.query.from;   // 'host' | 'peer'
  const since = parseInt(req.query.since || '0');

  // ── CRÉER UNE SESSION : POST /api/message  (sans code) ─────────────────────
  if (req.method === 'POST' && !code) {
    const newCode = generateCode();
    store.set(newCode, { createdAt: Date.now(), peerConnected: false,
                         forHost: null, forPeer: null });
    return res.json({ code: newCode, ttl: TTL });
  }

  // ── VÉRIFIER QU'UNE SESSION EXISTE : GET /api/message?code=X  (sans from) ──
  if (req.method === 'GET' && code && !from) {
    const session = store.get(code);
    if (!session) return res.status(404).json({ error: 'invalid or expired code' });
    session.peerConnected = true;   // le pair vient de rejoindre
    return res.json({ ok: true, age: Date.now() - session.createdAt });
  }

  // ── POUR TOUTES LES AUTRES ROUTES : le code est obligatoire ────────────────
  if (!code) return res.status(400).json({ error: 'missing code' });
  const session = store.get(code);
  if (!session) return res.status(404).json({ error: 'invalid or expired code' });

  // ── ENVOYER UN MESSAGE : POST /api/message?code=X&from=host|peer ───────────
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { payload } = JSON.parse(body);
        const key = from === 'host' ? 'forPeer' : 'forHost';
        session[key] = { payload, ts: Date.now() };
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
    const key = from === 'host' ? 'forHost' : 'forPeer';
    const msg = session[key];
    return res.json({
      payload:       (msg && msg.ts > since) ? msg.payload : null,
      ts:            (msg && msg.ts > since) ? msg.ts      : null,
      peerConnected: !!session.peerConnected
    });
  }

  // ── FERMER LA SESSION : DELETE /api/message?code=X ─────────────────────────
  if (req.method === 'DELETE') {
    store.delete(code);
    return res.json({ ok: true });
  }

  res.status(405).end();
};
