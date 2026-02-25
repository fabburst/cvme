# C+V.me 📋

Clone de copypaste.me — partage de texte temps réel entre appareils.  
Déployable sur **Vercel** (serverless, pas de WebSocket).

## Stack
- Vercel Serverless Functions (Node.js)
- Polling toutes les 1.2s (quasi temps réel)
- Chiffrement AES-256-GCM côté client
- Zéro dépendance frontend

## Déploiement Vercel

```bash
# Via CLI
npm i -g vercel
vercel

# Ou connecter le repo GitHub sur vercel.com
```

## Dev local

```bash
npm install
npm run dev
# → http://localhost:3000
```

## Comment ça marche

1. Appareil A clique "Partager" → reçoit un code `ABC-DEF` (valide 10 min)
2. Appareil B entre le code → rejoint la session
3. A envoie son texte (chiffré AES) → B le reçoit en ~1s
4. Bidirectionnel : B peut aussi répondre
