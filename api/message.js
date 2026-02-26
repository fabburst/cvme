// api/message.js — Push or poll a message for a session

if (!global._cvme) global._cvme = new Map();
const store = global._cvme;

const TTL = 10 * 60 * 1000;

function cleanup() {
  const now = Date.now();
  for (const [k, v] of store.entries()) {
    if (now - v.createdAt > TTL) store.delete(k);
  }
}

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  cleanup();

  const code = (req.query.code || '').toUpperCase();
  const from = req.query.from; // 'host' or 'peer'

  const session = store.get(code);
  if (!session) return res.status(404).json({ error: 'invalid or expired code' });

  if (req.method === 'POST') {
    // Push message: store payload directed at the OTHER party
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { payload } = JSON.parse(body);
        // Messages stored per direction: host->peer and peer->host
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

  if (req.method === 'GET') {
    // Poll: get message directed at ME, and status
    const key = from === 'host' ? 'forHost' : 'forPeer';
    const since = parseInt(req.query.since || '0');
    const msg = session[key];

    // Only return message if it's newer than client's last seen ts
    if (msg && msg.ts > since) {
      return res.json({
        payload: msg.payload,
        ts: msg.ts,
        peerConnected: session.peerConnected
      });
    }

    return res.json({
      payload: null,
      ts: null,
      peerConnected: session.peerConnected
    });
  }

  if (req.method === 'DELETE') {
    // Close session
    store.delete(code);
    return res.json({ ok: true });
  }

  res.status(405).end();
};
