<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Flujo de trabajo (obligatorio)

**Local primero, VPS después.** Ningún cambio se sube al VPS sin haberlo probado
antes en el Docker local:

```bash
# 1) Probar en local (contenedor valo-dash, puerto 4321)
cd valo-dash-next
docker compose up -d --build
BASE_URL=http://localhost:4321 bash scripts/verify-deploy.sh

# 2) Solo si el paso 1 está verde, subir al VPS
git push origin main
ssh ubuntu@valoia-personal.duckdns.org
  git -C /opt/valoia-main pull
  cd /opt/valoia && docker compose -f docker-compose.vps.yml -f docker-compose.personal-main.yml up -d --build valo-dash
```

Reglas que se derivan de esto:

- **La key de Henrik es la misma en local y en el VPS.** Dos instancias haciendo
  warmup a la vez superan el límite de 30 req/min de la key (se ve como
  «Rate limit de api.henrikdev.xyz alcanzado» en la UI). Por eso el compose local
  fuerza `VAL_BACKGROUND_REFRESH=0`: el warmup es cosa del VPS, el local consulta
  solo cuando se navega.
- **El primer arranque local es lento** (caché en frío, incluido el bucket v3):
  la carga inicial puede tardar ~1 min. No es un cuelgue.
- Un cambio visual se valida con capturas reales de `http://localhost:4321`
  (Playwright), no solo con `tsc`/tests.
- Si un cambio toca UI, revisar también móvil (`playwright-cli resize 390 844`).

