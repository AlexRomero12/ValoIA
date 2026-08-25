# ValoIA · Dashboard

Dashboard personal de rendimiento para VALORANT + Aim Lab. Datos en vivo desde la API de HenrikDev (partidas, MMR, RR) y Aimlabs GraphQL, con cache persistente, Docker y soporte para los 4 perfiles del equipo.

> Estado actual: **v1.1.0** — ver [CHANGELOG.md](./CHANGELOG.md)

## Estructura

```
app/                  Páginas (/, /valorant, /comparativo) + API routes
components/           TopBar, KpiGrid, WrPanel, TierChart, MatchesTable, MatchDetailModal
components/compare/   Filtros, ranking, trend, heatmap y tabla jugador × agente
lib/                  Clientes Henrik/Riot/Aimlabs, agregación, cache L1+L2, hooks
docs/                 Planes de diseño de vistas
public/               Estáticos
```

## Features

### Página Ranked (`/valorant`)
- **Selector de perfil del cuarteto**: Alex · NoMicr · Gengar · Juan — todo el dash se recalcula
- KPIs vs metas del plan (WR ≥55%, K/D ≥1.05, ACS ≥220, HS% ≥25%, ADR ≥150)
- Winrate por agente y por mapa con íconos oficiales
- Trend de rango (eje desde Platino, promociones ▲ / descensos ▼)
- **Partidas recientes**: íconos de agente/mapa, K/D, ACS, ADR, HS%, ±RR con tooltip de MMR; stats en verde al cumplir meta
- **Filtros por click**: click en mapa/agente filtra la tabla (combinables, chips para limpiar)
- **Detalle de partida** (click en fila): scoreboard completo de los 10 jugadores con economía, timeline ronda por ronda con motivo (⚔ eliminación · 💥 detonación · ✂ defusa · ⏱ tiempo), duelos de apertura y quién te eliminó
- Filtro por **temporada** o ventanas de 7/14/30/90 días

### Página Comparar (`/comparativo`)
- Los **4 perfiles del cuarteto lado a lado**: ranking ordenable (WR, K/D, ACS, ADR, HS%, RR neto) con columnas clickeables
- **Evolución comparada** en un solo gráfico: WR/ACS/K/D/ELO por día o semana
- **Heatmap jugador × agente** y tabla analítica estilo VLR con mini-barras por celda (modo todos / mejores combos)
- Filtros combinables: ventana (temporada o 7/14/30/90 días), rango de fechas custom, mapa y **filtro de agentes por iconitos**
- Filtro de mínimo de partidas y leyenda de cobertura de datos

### Página Aim Lab (`/`)
- Sesión del día por escenario con gráfico de barras (color = precisión)
- Habilidades Aimlabs, enfoque recomendado, PBs e histórico por escenario

### Transversal
- Cache L1 memoria + L2 disco persistente (sobrevive reinicios)
- Throttle 24 req/min + pausas entre páginas (respeta límite de Henrik Basic: 30/min)
- Cooldown de 60s en Actualizar
- Zona horaria America/Bogota en contenedor

## Stack

Next.js 16 (App Router, standalone) · React 19 · TypeScript · TanStack Query v5 · CSS puro con design system propio · Docker multi-stage

## Configuración de llaves (`.env`)

Las llaves **viven solo en archivos `.env` locales** — están en `.gitignore` y nunca se suben al repo. Cada proyecto tiene su plantilla `.env.example`.

### Paso a paso

```bash
# 1. Crear el .env desde la plantilla
cp .env.example .env
```

### 2. `HENRIK_API_KEY` — requerida (partidas, MMR, RR)

1. Únete al Discord de HenrikDev: <https://discord.gg/henrikdev>
2. Ve a <https://api.henrikdev.xyz/dashboard/> e inicia sesión con Discord
3. **API Keys → Create Key** → tipo *Basic* (instantánea, 30 req/min)
4. Pega la clave (empieza con `HDEV-`) en tu `.env`:
   ```
   HENRIK_API_KEY=HDEV-tu-clave-aqui
   ```

### 3. `RIOT_API_KEY` — opcional (fallback básico)

1. Login en <https://developer.riotgames.com> con tu cuenta Riot
2. Panel → **DEVELOPMENT KEY** → *Generate* (⚠️ expira cada 24 h)
3. Pégala como `RIOT_API_KEY=RGAPI-...`

> La API oficial de Riot **no expone RR/MMR ni match history** para keys de desarrollo — por eso Henrik es el proveedor principal.

### 4. Resto de variables

| Variable | Default | Descripción |
|---|---|---|
| `VAL_NAME` / `VAL_TAG` | `AlexRomero12` / `LAN` | Riot ID del perfil principal |
| `VAL_REGION` / `VAL_PLATFORM` | `na` / `pc` | Routing de Henrik (LAN comparte deployment con NA) |
| `AIMLAB_USERNAME` / `AIMLAB_USER_ID` | — | Perfil de Aimlabs para la página `/` |

## Seguridad

- `.env`, `.env.*` y llaves (`*.key`, `*.pem`) están excluidos vía `.gitignore`
- Antes de cada commit se puede auditar con: `git diff --cached | Select-String "RGAPI-|HDEV-"` (debe devolver vacío)
- Si una clave llegara a filtrarse: revócala inmediatamente (dashboard de Henrik / portal de Riot)

## Correr

```bash
# Docker (recomendado)
docker compose up -d --build        # http://localhost:4321

# Local
npm install && npm run dev          # http://localhost:3000
```

O ejecutar `iniciar.bat` en Windows (Docker primero, fallback local).

## API interna

| Endpoint | Descripción |
|---|---|
| `GET /api/data?days=&refresh=` | Dataset Aim Lab (días, PBs, focus) |
| `GET /api/valorant/summary?season=current\|days=N&player=id&refresh=` | Resumen ranked agregado |
| `GET /api/valorant/match?id=&player=` | Detalle completo de una partida cacheada |
| `GET /api/valorant/agents` | Catálogo de agentes con iconos (cache 24 h) |
| `GET /api/valorant/status?player=` | Estado de proveedor/key/cuenta |

## Notas

- El RR/MMR se obtiene de `mmr-history`; la API oficial de Riot no lo expone
- Las partidas cacheadas son inmutables: reabrir un detalle cuesta $0$ requests
