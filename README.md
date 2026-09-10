# ValoIA · Dashboard

Dashboard personal de rendimiento para VALORANT. Datos en vivo desde la API de HenrikDev (partidas, MMR, RR) con cache persistente, Docker y **perfiles configurables** (tú decides a quién ver y qué reglas aplicar).

> Estado actual: **v1.8.0** — ver [CHANGELOG.md](./CHANGELOG.md)

## Estructura

```
app/                  Páginas (/valorant, /comparativo, /team, /tienda, /auditoria, /perfiles) + API routes
components/           TopBar, KpiGrid, WrPanel, TierChart, MatchesTable, MatchDetailModal, LoadingOverlay
components/audit/     Auditoría: día auditado, recomendaciones con acción
components/compare/   Filtros, ranking, trend, heatmap y tabla jugador × agente
components/profiles/  Formulario de perfil, selector, editor de reglas de auditoría y selector de agentes
components/store/     Tienda de hoy, favoritas y panel de notificaciones
lib/                  Clientes Henrik/Riot, perfiles, agregación, auditoría, cache L1+L2, hooks
docs/                 Planes de diseño de vistas
public/               Estáticos (incluye sw.js para Web Push)
```

## Features

### Página Ranked (`/valorant`)
- **Selector de perfiles visibles**: los que marques en `/perfiles` (Player, Player2, Player3, Player4 de fábrica) — todo el dash se recalcula
- **Todas las cuentas combinadas**: KPIs, WR por agente y mapa, arsenal y trend se calculan sobre la unión de la cuenta principal + alternativas del perfil elegido (útil para ver todo lo que juega y dónde)
- **Rango con badges oficiales**: icono del tier con tooltip en el chip (con **RR dentro del rango** en vez de MMR crudo), en el eje Y del gráfico de tendencia y en el scoreboard del detalle
- KPIs vs metas del plan (WR ≥55%, K/D ≥1.05, ACS ≥220, HS% ≥25%, ADR ≥150)
- Winrate por agente y por mapa con íconos oficiales (click filtra las partidas)
- **Arsenal · Uso de armas** por perfil: kills por arma con barra de uso, K/D por arma y "con qué te matan" — calculado desde el kill feed del archivo acumulativo ($0 requests), con íconos y categorías de valorant-api.com
- Trend de rango (eje desde Platino, promociones ▲ / descensos ▼)
- **Partidas recientes**: íconos de agente/mapa, K/D, ACS, ADR, HS%, ±RR con tooltip de MMR; stats en verde al cumplir meta
- **Filtros por click**: click en mapa/agente filtra la tabla (combinables, chips para limpiar)
- **Detalle de partida** (click en fila): scoreboard completo de los 10 jugadores con economía, timeline ronda por ronda con motivo (⚔ eliminación · 💥 detonación · ✂ defusa · ⏱ tiempo), duelos de apertura y quién te eliminó
- Filtro por **temporada** o ventanas de 7/14/30/90 días

### Página Comparar (`/comparativo`)
- **Perfiles lado a lado (los que elijas)**: selector multi-perfil + botón “Agregar perfil”; ranking ordenable (WR, K/D, ACS, ADR, HS%, RR neto) con columnas clickeables
- **Evolución comparada** en un solo gráfico: WR/ACS/K/D/**RANGO** por día o semana — la métrica RANGO muestra el tier + RR (ej. "D1 · 20") con el eje Y iniciando en Platinum 3 para no perder detalle
- **Heatmap jugador × agente** y tabla analítica estilo VLR con mini-barras por celda (modo todos / mejores combos); columna de rango con **badge del tier + RR**
- Filtros combinables: ventana (temporada o 7/14/30/90 días), rango de fechas custom, mapa y **filtro de agentes por iconitos**
- Filtro de mínimo de partidas y leyenda de cobertura de datos

### Página Team (`/team`)
- **Composiciones por mapa** para los perfiles que selecciones (eligiendo desde `/perfiles` o con “Agregar perfil”)
- Con 4 jugadores reparte 1 rol por jugador; con otro número busca la mejor combinación libre respetando las reglas (máx 2 por rol, sin dos roles duplicados)
- Prioriza la meta pro (VCT) y las preferencias manuales agente-mapa del perfil; backups por pick

### Página Perfiles (`/perfiles`)
- **CRUD de perfiles**: etiqueta, Riot ID, rol, color, cuentas alternativas (stats mezcladas), preferencias agente por mapa y flags **visible** (Ranked) y **principal** (★)
- **Perfil principal**: solo puede haber uno; Auditoría audita únicamente a él, la Tienda muestra únicamente su tienda y el push semanal es solo suyo
- **Reglas de auditoría por persona**: pool por mapa (principal/backup) con selector de agentes por iconos, prohibidos (agentes y roles, p. ej. Initiator), regla de parada, pausa de sesión y metas semanales
- Copiar reglas de otro perfil e **importar/exportar JSON** para compartirlas
- Persistencia en `data/profiles.json` (volumen `valo-data`, externo al cache)

### Página Auditoría (`/auditoria`)
- Audita **solo el perfil principal** (se elige en `/perfiles`, sin selector aquí) contra sus reglas: pool por mapa (principal/backup/prohibido), regla de parada (N derrotas con K/D < X) y separación por sesiones (pausa configurable)
- Hero semanal con **RR real vs "Con regla" vs "Regla + pool"**, cortes totales/ignorados, fuera de pool y prohibidos
- Por día: barras de RR por partida (cinta de peligro en el corte, bandas de sesión), RR acumulado real vs plan, y tabla con badges `M`/`B`/`P`/`X` (principal/backup/fuera/prohibido) y CORTE AQUÍ
- **Recomendaciones con acción**: violaciones recurrentes, reglas vs datos (subir/bajar agente), RR evitable por cortes ignorados, metas de la semana y mapas sin regla — se aplican con un click
- **Notas por partida**: contexto propio en cada fila, persistente en `data/match-comments.json` (volumen `valo-data`, externo al cache)
- **Snapshots de días auditados por perfil** (`perfilId:fecha` + versión de reglas): las semanas viejas se reconstruyen desde la copia cuando la API ya no devuelve el RR

### Página Tienda (`/tienda`)
- **Tienda diaria** con las 4 skins del día + bundle destacado (precio, descuento, tiempo restante) — solo la del **perfil principal**: si la sesión conectada (Riot Client/RSO) es otra cuenta, se avisa y no se muestra la tienda ajena (la vigilancia push tampoco notifica)
- Fuentes de datos: **API local del cliente de Valorant** (con el juego abierto, vía `tools/riot-proxy.js` en Docker) y **respaldo RSO por Cookie Reauth** — pegas la cookie `ssid` de tu sesión en auth.riotgames.com una vez y el server renueva los tokens solo cada hora (Riot ya exige hCaptcha en el login por contraseña; HenrikDev eliminó la tienda individual de su API v4)
- **Previsualización**: click en cualquier skin (tienda, bundle, favoritas o explorador) abre un lightbox con el render a tamaño grande y sus **variantes de color (chromas)** para cambiar el color en vivo
- **Skins favoritas persistentes**: explorador del arsenal completo por categoría de arma (Sidearms → Melee) con iconos, contador de skins por arma y búsqueda por nombre; snapshot denormalizado en `data/favorites.json` (volumen Docker `valo-data`, inmune al borrado del cache)
- Badge **"¡EN TIENDA!"** sobre las favoritas disponibles hoy, con precio
- **Web Push**: activa notificaciones y el cron avisa al instante cuando una favorita aparece en la tienda (una vez por día por skin, sin spam); botón **Enviar prueba** para verificar el pipeline

### Transversal
- **Loader de cargas grandes**: panel flotante con progreso (perfil i/N) y cronómetro, sin sensación de app congelada; overlay bloqueante en cargas iniciales
- Cache L1 memoria + L2 disco persistente (sobrevive reinicios)
- **Escrituras atómicas** (`.tmp` + rename) en todos los datos persistentes (favoritas, comentarios, tokens RSO, archivo) — un crash nunca corrompe un JSON
- **Archivo acumulativo de partidas** (modelo tracker.gg, `lib/archive.ts`): toda partida sincronizada se guarda para siempre en `data/archive/` (un JSON por partida + índice), **externo al cache** — inmune a `invalidateAll`, al borrado de `.cache/` y a rebuilds de Docker (volumen dedicado). Las agregaciones de temporada y ventanas largas calculan sobre bucket + archivo, así jugar 100+ partidas en el acto ya no recorta la vista de agentes/mapas
- **Backfill profundo** (`POST /api/valorant/backfill`): pagina el historial competitivo más allá del bucket y lo archiva; una pasada (default 40 páginas ≈ 400 partidas) y no se repite salvo `force=1`
- Bucket de partidas por jugador con **sync incremental**: un refresh sin novedades cuesta 1 request; el historial se pagina solo al profundizar ("Cargar más": 10 → 20 → 40)
- Refresco SWR: Actualizar dispara la revalidación en segundo plano (`POST /api/valorant/refresh`) y la UI sondea `window.syncedAt` sin gastar cuota
- Throttle 24 req/min + espaciado mínimo de 1.8 s (respeta límite de Henrik Basic: 30/min)
- Cron opcional (`VAL_BACKGROUND_REFRESH=1`, ver `.env.example`): sincroniza los **perfiles visibles** en background para que abrir el dashboard cueste $0 requests
- **Aviso semanal de auditoría por Web Push** (lunes; `VAL_AUDIT_PUSH=0` lo apaga): resume los cortes ignorados y violaciones de pool de la semana anterior del **perfil principal**
- Cooldown de 15s en Actualizar
- Zona horaria UTC en contenedor

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
| `VAL_NAME` / `VAL_TAG` | `Player` / `LAN` | Riot ID de la cuenta del `.env` (la usa el proveedor Riot de fallback y el seed inicial de perfiles) |
| `VAL_REGION` / `VAL_PLATFORM` | `na` / `pc` | Routing de Henrik (LAN comparte deployment con NA) |
| `VAL_BACKGROUND_REFRESH` | `0` | `1` activa el cron que sincroniza los perfiles visibles cada `VAL_REFRESH_INTERVAL_MIN` min y alimenta el archivo |
| `VAL_REFRESH_INTERVAL_MIN` | `15` | Intervalo del cron en minutos |
| `VAL_AUDIT_PUSH` | `1` | `0` apaga el aviso semanal de auditoría por Web Push (requiere Web Push configurado) |
| `ARCHIVE_DIR` | `data/archive` | Directorio del archivo acumulativo de partidas (persistente, externo al cache) |
| `DATA_DIR` | `data` | Datos persistentes de la app: perfiles, favoritas, suscripciones push, tokens RSO, notificaciones (externo al cache) |
| `STORE_SHARD` | `na` | Shard de `pd.a.pvp.net` para el storefront (latam/br/na → `na`) |
| `STORE_LOCAL_HOST` | `127.0.0.1` | Host de la API local del Riot Client (`host.docker.internal` en Docker) |
| `RIOT_LOCKFILE` | `%LOCALAPPDATA%\Riot Games\Riot Client\Config\lockfile` | Ruta al lockfile del Riot Client (en Docker lo monta docker-compose) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | — | Web Push (`npx web-push generate-vapid-keys`) |
| `VAL_RIOT_USER` / `VAL_RIOT_PASS` | — | Credenciales para el respaldo RSO (opcional; Riot exige hCaptcha en el login programático — la vía recomendada es pegar la cookie `ssid` desde la página Tienda) |

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
| `GET /api/valorant/summary?season=current\|days=N&player=perfilId&limit=` | Resumen ranked agregado (`limit` = profundidad 1-40, default 10) |
| `POST /api/valorant/refresh?player=perfilId&scope=all\|matches\|mmr&limit=` | Revalidación en background del bucket/MMR/cuenta; responde `{started:true}` al instante |
| `POST /api/valorant/backfill?player=perfilId&mode=season\|all&maxPages=&force=` | Backfill profundo del historial (fire-and-forget); el detalle de cada partida vieja queda en el archivo |
| `GET /api/valorant/backfill?player=perfilId` | Estado del archivo por perfil/cuenta: total archivado, rango de fechas y último backfill |
| `GET /api/valorant/profiles` | Lista de perfiles guardados (Riot ID, rol, visible, reglas de auditoría) |
| `POST /api/valorant/profiles` | `{action: upsert, profile}` / `{action: delete, id}` — CRUD de perfiles |
| `GET /api/valorant/match?id=&player=perfilId` | Detalle completo de una partida cacheada |
| `GET /api/valorant/agents` | Catálogo de agentes con iconos y rol (cache 24 h) |
| `GET /api/valorant/status?player=perfilId` | Estado de proveedor/key/cuenta |
| `GET /api/store/status` | Tienda de hoy + bundle + favoritas (con coincidencias y estado de notificación) + estado RSO/push; `?refresh=1` fuerza revalidación |
| `GET /api/store/catalog?q=\|weapon=` | Búsqueda en el catálogo de skins o todas las skins de un arma |
| `GET /api/store/weapons` | Armas agrupadas por categoría con iconos y contador de skins |
| `GET /api/store/chromas?id=` | Variantes de color (chromas) de una skin |
| `POST /api/store/favorites` | `{action: add\|remove, offerId}` — favoritas persistentes |
| `POST /api/store/auth` | `{action: login}` / `{action: code, code}` / `{action: cookie, ssid}` — respaldo RSO |
| `POST /api/push/subscribe` / `DELETE ?endpoint=` | Suscripción Web Push del navegador |
| `POST /api/push/test` | Envía una notificación de prueba a todas las suscripciones |
| `GET /api/valorant/tiers` | Badges oficiales por tier (iconos de rango, cache 7 días) |
| `GET /api/valorant/audit-history` | Snapshots guardados de días auditados por perfil (`perfilId:fecha`, con versión de reglas) |
| `POST /api/valorant/audit-history` | `{days:[...]}` — guarda/actualiza snapshots de días completos |
| `GET /api/valorant/comments` | Notas por partida guardadas (`{matchId: {text, updatedAt}}`) |
| `POST /api/valorant/comments` | `{matchId, text}` — guarda o borra (texto vacío) la nota de una partida |

## Notas

- Los perfiles viven en `data/profiles.json` (volumen `valo-data`); borrar un perfil no borra sus partidas archivadas
- El RR/MMR se obtiene de `mmr-history`; la API oficial de Riot no lo expone
- Las partidas cacheadas son inmutables: reabrir un detalle cuesta $0$ requests
- El backfill de historial completo es **una vez por jugador**: con key Basic tarda ~1.8 s por página (40 páginas ≈ 2 min). Partidas anteriores a cuando Henrik indexó la cuenta no existen en ninguna API externa — nadie fuera de Riot puede recuperarlas
- Las partidas nuevas se archivan solas en cada sync (cron o refresh): el archivo crece sin costo extra de requests
- El archivo vive en `data/archive/` — borrar el cache (`.cache/` o el volumen `valo-cache`) NO lo afecta; solo se pierde si borras esa carpeta o su volumen (`valo-archive`)
- **Vía local de la tienda en Docker**: requiere `node tools/riot-proxy.js` corriendo en el host (la API local del cliente de Valorant solo acepta conexiones desde 127.0.0.1); para autostart pon un acceso directo a ese comando en `shell:startup`
