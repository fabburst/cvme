// api/session.js — Create a new session, returns a code
// Using a simple in-memory store via a module-level variable
// (persists across warm invocations on Vercel)

const crypto = require('crypto');

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TTL = 10 * 60 * 1000; // 10 minutes

// Global store (shared across warm lambda instances on same machine)
if (!global._cvme) global._cvme = new Map();
const store = global._cvme;

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
  for (const [k, v] of store.entries()) {
    if (now - v.createdAt > TTL) store.delete(k);
  }
}

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  cleanup();

  if (req.method === 'POST') {
    // Create session
    const code = generateCode();
    store.set(code, { createdAt: Date.now(), payload: null, peerConnected: false });
    return res.json({ code, ttl: TTL });
  }

  if (req.method === 'GET') {
    // Check if session exists
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'missing code' });
    const session = store.get(code.toUpperCase());
    if (!session) return res.status(404).json({ error: 'invalid or expired code' });
    // Mark peer connected
    session.peerConnected = true;
    return res.json({ ok: true, age: Date.now() - session.createdAt });
  }

  res.status(405).end();
};
