# Nutri Landing

Landing page pública pt-BR. Stack: Vite + Tailwind, sem framework JS (HTML estático).

```bash
npm install
npm run dev        # http://localhost:5174
npm run build
npm run deploy     # build + wrangler deploy (Cloudflare Workers)
```

## Env

Por padrão os CTAs apontam pra `https://nutri.pancabiel.workers.dev`. Pra apontar pra outro lugar em dev:

```
VITE_APP_URL=http://localhost:5173
```

## Deploy

Cria-se o Worker `nutri-landing` no primeiro `wrangler deploy`. URL: `https://nutri-landing.pancabiel.workers.dev`.

Domínio custom (`nutri.app.br` ou similar) configura-se no dashboard Cloudflare → Workers → nutri-landing → Custom Domains.
