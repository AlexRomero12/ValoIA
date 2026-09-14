# ValoIA · Dashboard (rama `feat/riot-dev-oficial`)

Rama de migración a la **API oficial de Riot**. Single-user (**AlexRomero12#lan**),
sin login, sin Tienda y sin RR/MMR (la API oficial no los expone).

> Estado: **DEV**. Con dev key solo funcionan ACCOUNT-V1, VAL-CONTENT-V1 y
> VAL-STATUS-V1; las partidas (VAL-MATCH-V1) se sirven del **mock** generado
> desde el archivo real (`RIOT_MATCH_SOURCE=mock`). Al tener la key productiva
> se cambia a `live` sin tocar código.

## Modos de la app (`APP_MODE`)

| Modo | Qué es | Docker local |
|---|---|---|
| `single` (default) | Instancia personal de AlexRomero12#LAN, sin login | `docker-compose.riot-dev.yml` → **:4322** |
| `public` | Producto para la solicitud de Riot: cuentas locales, vinculación Riot (RSO/mock), consentimiento/opt-in y perfiles públicos | `docker-compose.public.yml` → **:4323** |

El paquete de solicitud vive en [`docs/riot/`](./docs/riot/):
`aplicacion.md` (texto EN para el portal) y `runbook-publicacion.md` (pasos para
publicar y verificar). En `public` sin credenciales RSO la vinculación usa el
proveedor demo (`MOCK_RIOT_IDS`); `RSO_ENABLED=1` activa el OAuth2 real.

## Estructura

```
app/                  Páginas (/valorant, /team, /tienda, /reglas, /perfiles) + API routes
components/           TopBar, KpiGrid, WrPanel, TierChart, MatchesTable, MatchDetailModal, LoadingOverlay, InfoTip
components/rules/     Reglas de sesión: intro y propuesta, día evaluado, recomendaciones con acción
components/compare/   Filtros, ranking, trend y tarjetas de agentes Por jugador / Por agente
components/profiles/  Formulario de perfil, selector, editor de reglas de sesión y selector de agentes
components/store/     Tienda de hoy, favoritas y panel de notificaciones
lib/                  Clientes Henrik/Riot, perfiles, agregación, reglas de sesión, propuesta, export/import, cache L1+L2, hooks
docs/                 Guía de despliegue en Oracle
public/               Estáticos (incluye sw.js para Web Push)
```

## Features

### Acceso y seguridad
- **Login con usuarios**: la app entera queda detrás de sesión (`proxy.ts` de Next 16). Páginas sin sesión → `/login?next=…`; API → 401; `/sw.js` y estáticos quedan libres. El login explica qué es ValoIA y el flujo de alta (solicitud → aprobación → contraseña temporal)
- **Solicitudes de acceso con aprobación**: desde `/login` se puede pedir cuenta (rate-limit por IP); el admin aprueba/rechaza en **Perfiles → Solicitudes** y la aprobación genera una contraseña temporal con cambio forzado al entrar
- **Contraseñas**: mínimo 8 (mejor frase de 12+), repetir con validación y ver/ocultar; con contraseña temporal el **panel queda bloqueado** (solo Perfiles) hasta cambiarla, con aviso y acceso directo al formulario
- **Aislamiento por dueño**: cada perfil tiene `owner`; cada usuario (incluido el admin) ve y edita **solo sus perfiles** en Ranked, Equipo, Reglas de sesión y Perfiles, sus favoritas, su tienda y sus notas. El admin solo añade la gestión de usuarios; **no ve perfiles, tiendas ni favoritas ajenas**
- **Sesiones revocables**: registry `data/sessions.json` con dispositivo/IP/último uso; tope 5 por usuario y 3 por IP; panel **Sesiones** para cerrar una o las demás; cambiar contraseña o borrar usuario revoca sus sesiones
- Contraseñas con **scrypt** + sal por usuario en `data/users.json`; sesiones firmadas **HMAC-SHA256** con `AUTH_SECRET` (cookie `HttpOnly` + `SameSite=Lax` + `Secure`, 30 días)
- **Límites**: login 5/10min por IP+usuario, 10/15min por usuario y 30/15min por IP (429 + `Retry-After`); solicitudes 3/h por IP; refresh 10s por usuario; máx. 10 perfiles por usuario (20 el admin); **backfill solo admin**
- **Endurecimiento**: `Origin` propio en mutaciones (CSRF), headers (`X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`), IP real con `TRUST_PROXY`, contraseña ≤128 y sanitización del `next`
- **Actividad** (`data/auth-log.json`, últimos 500): logins, altas/bajas, cambios y solicitudes, visible en el panel admin

### Página Ranked (`/valorant`)
- **Hub con tabs** (`Resumen · Agentes · Mapas · Arsenal`, enlazables con `?tab=`): Resumen = KPIs + historial + top 3 + trend; Agentes/Mapas con tabla completa y ordenable (click en fila filtra las partidas); Arsenal con el panel de armas
- **Selector de perfiles visibles**: los que marques en `/perfiles` (el inicial se siembra desde `VAL_NAME`/`VAL_TAG`) — todo el dash se recalcula
- **Todas las cuentas combinadas**: KPIs, WR por agente y mapa, arsenal y trend se calculan sobre la unión de la cuenta principal + alternativas del perfil elegido (útil para ver todo lo que juega y dónde)
- **Rango con badges oficiales**: icono del tier con tooltip en el chip (con **RR dentro del rango** en vez de MMR crudo), en el eje Y del gráfico de tendencia y en el scoreboard del detalle
- KPIs vs metas del plan (WR ≥55%, K/D ≥1.05, ACS ≥220, HS% ≥25%, ADR ≥150) con ayuda `(?)` en cada tarjeta
- **Forma reciente y deltas**: últimas 5 partidas (V/D/E) con racha actual, y cada KPI con su variación contra la ventana anterior de igual duración (mín. 3 partidas)
- Winrate por agente y por mapa con íconos oficiales (click filtra las partidas); el panel de **agente muestra los 6 más jugados** con **Ver más/Ver menos** (el resto queda a un toque, sin estirar el layout)
- **Arsenal · Uso de armas** por perfil: kills por arma con barra de uso, K/D por arma y "con qué te matan" — calculado desde el kill feed del archivo acumulativo ($0 requests), con íconos y categorías de valorant-api.com
- **Trend de rango** (últimas 20 partidas, con nota «de N»): resumen del período (rango inicial → actual, pico, RR neto y récord), leyenda V/D/E y detalle de cada partida al pasar o tocar el punto (fecha, mapa, agente, marcador, K/D/A, ACS, ±RR y rango)
- **Partidas recientes**: agrupadas por día (el día más reciente expandido al entrar; el resto, colapsado), con WR%, V-D-E, K/D, ACS, ADR y ±RR en el resumen de cada día; click en el día abre el análisis completo con mejores/peores partidas, por agente y por mapa
- **Columnas por partida**: íconos de agente/mapa, K/D, ACS, ADR, HS%, ±RR con tooltip de MMR; stats en verde al cumplir meta
- **Filtros multi en el historial**: agrega varios agentes/mapas desde la barra de «Partidas recientes» (selects con conteo, chips para quitar, Limpiar y contador `N de M partidas · D días`); también se filtran desde los iconos de cada fila, los paneles de WR y las tablas de Agentes/Mapas («Ver partidas»); con filtro activo el historial se despliega completo
- **Detalle de partida** (click en fila): scoreboard completo de los 10 jugadores con economía, timeline ronda por ronda con motivo (⚔ eliminación · 💥 detonación · ✂ defusa · ⏱ tiempo), duelos de apertura y quién te eliminó
- Filtro por **temporada** o ventanas de 7/14/30/90 días

### Página Equipo (`/team`)
- **Hub con tabs** (`Comparar · Composiciones`, enlazables con `?tab=`): `/comparativo` redirige a `/team?tab=comparar`
- **Tab Comparar — perfiles lado a lado**: selector multi-perfil + botón “Agregar perfil”; ranking ordenable (WR, K/D, ACS, ADR, HS%, RR neto) con columnas clickeables y, en móvil, tarjetas por jugador donde la **Métrica** elegida manda el orden y se pinta en grande
- **Evolución comparada** en un solo gráfico: WR/ACS/K/D/**RANGO** por día o semana — la métrica RANGO muestra el tier + RR (ej. "D1 · 20") con el eje Y iniciando en Platinum 3 para no perder detalle
- **Agentes en tarjetas**: sub-vista **Por jugador** (los agentes de cada uno con WR%, K/D, ACS y RR; top 4 + ver todos) y **Por agente** (WR de cada jugador con ese agente, ordenado por partidas; pie con total, WR global y mejor jugador) — sustituyen al heatmap y a la tabla densa en todas las vistas
- Filtros combinables: ventana (temporada o 7/14/30/90 días), rango de fechas custom, mapa y **filtro de agentes por iconitos**; Perfiles y filtros viven en un único bloque ordenado
- Filtro de mínimo de partidas y leyenda de cobertura de datos
- **Móvil ≤720px**: filtros colapsables con contador, el gráfico de Evolución siempre visible antes de las pestañas **Resumen | Agentes**, ranking en tarjetas con la métrica activa en grande y tarjetas de agentes a una columna (alto natural)

- **Tab Composiciones — composiciones por mapa** para los perfiles que selecciones (eligiendo desde `/perfiles` o con “Agregar perfil”)
- Con 4 jugadores reparte 1 rol por jugador; con otro número busca la mejor combinación libre respetando las reglas (máx 2 por rol, sin dos roles duplicados)
- Prioriza la meta pro (VCT) y las preferencias manuales agente-mapa del perfil; backups por pick

### Página Perfiles (`/perfiles`)
- **CRUD de perfiles**: etiqueta, Riot ID, **roles multi-select** (Duelist/Initiator/Controller/Sentinel), color, cuentas alternativas (stats mezcladas), preferencias agente por mapa y flags **visible** (Ranked) y **principal** (★)
- **Perfil principal**: solo puede haber uno; las Reglas de sesión evalúan únicamente a él, la Tienda muestra únicamente su tienda y el push semanal es solo suyo
- **Reglas de sesión por persona**: pool por mapa (1 principal y hasta 2 backups) con selector de agentes por iconos, prohibidos (agentes y roles, p. ej. Initiator), regla de parada, pausa de sesión y metas semanales
- Copiar reglas de otro perfil y **exportar/importar perfiles** en un archivo `.valoia.json` (etiqueta, Riot ID, cuentas, preferencias y reglas; nunca RSO ni notas) — importar crea perfiles nuevos respetando el tope
- Persistencia en `data/profiles.json` (volumen `valo-data`, externo al cache)

### Página Reglas de sesión (`/reglas`)
- Evalúa **solo el perfil principal** (se elige en `/perfiles`, sin selector aquí) contra sus reglas: pool por mapa (principal/backup/prohibido), regla de parada (N derrotas con K/D < X) y separación por sesiones (pausa configurable)
- **Guía integrada**: panel explicativo (qué mide, cómo funciona y dónde se configura) y **propuesta inicial de reglas** calculada desde tus últimas partidas (pool por mapa, prohibidos por WR y metas) con vista previa y aplicación en un clic
- Hero semanal con **RR real vs "Con regla" vs "Regla + pool"**, cortes totales/ignorados, fuera de pool y prohibidos
- Por día: barras de RR por partida (cinta de peligro en el corte, bandas de sesión), RR acumulado real vs plan, y tabla con badges `M`/`B`/`P`/`X` (principal/backup/fuera/prohibido) y CORTE AQUÍ
- **Recomendaciones con acción**: violaciones recurrentes, reglas vs datos (subir/bajar agente), RR evitable por cortes ignorados, metas de la semana y mapas sin regla — se aplican con un click
- **Notas por partida**: contexto propio en cada fila, persistente en `data/match-comments.json` (volumen `valo-data`, externo al cache)
- **Snapshots de días evaluados por perfil** (`perfilId:fecha` + versión de reglas): las semanas viejas se reconstruyen desde la copia cuando la API ya no devuelve el RR

### Página Tienda (`/tienda`)
- **Tienda diaria por usuario**: cada uno conecta **su** Riot desde un panel guiado con la cabecera `cookie` completa de `auth.riotgames.com` (recomendada: dura ~3 semanas; también sirve solo `ssid`, ~1 semana); el server renueva tokens solo cada hora y avisa (banner + push) cuando la sesión caduca. Ve su rotación de 4 skins + bundle destacado con precio/descuento/tiempo restante — todo **privado** (el admin tampoco ve lo ajeno)
- Si la sesión conectada no es la del perfil principal del usuario, se avisa y no se muestra la tienda ajena; sin perfil principal, invita a crearlo en Perfiles
- **Previsualización**: click en cualquier skin (tienda, bundle, favoritas o explorador) abre un lightbox con el render a tamaño grande y sus **variantes de color (chromas)** para cambiar en vivo; las imágenes se sirven optimizadas (`next/image`, WebP, caché 31 días)
- **Skins favoritas persistentes por usuario**: explorador del arsenal completo por categoría de arma (Sidearms → Melee) con iconos, contador de skins por arma y búsqueda por nombre; snapshot denormalizado en `data/favorites.<usuario>.json` (volumen Docker `valo-data`, inmune al borrado del cache)
- Badge **"¡EN TIENDA!"** sobre las favoritas disponibles hoy, con precio
- **Web Push**: activa notificaciones y el cron avisa al instante cuando una favorita aparece en la tienda (una vez por día por skin, sin spam); botón **Enviar prueba** para verificar el pipeline

### Transversal
- **Loader de cargas grandes**: panel flotante con progreso (perfil i/N) y cronómetro, sin sensación de app congelada; overlay bloqueante en cargas iniciales
- Cache L1 memoria + L2 disco persistente (sobrevive reinicios)
- **Medios ligeros**: iconos de agente vía `killfeedPortrait` (~24 KB) y assets del CDN optimizados con `next/image` (WebP, caché 31 días, volumen `valo-next-cache`); catálogos con caché privada y `preconnect` al CDN
- **Escrituras atómicas** (`.tmp` + rename) en todos los datos persistentes (favoritas, comentarios, tokens RSO, archivo) — un crash nunca corrompe un JSON
- **Archivo acumulativo de partidas** (modelo tracker.gg, `lib/archive.ts`): toda partida sincronizada se guarda para siempre en `data/archive/` (un JSON por partida + índice), **externo al cache** — inmune a `invalidateAll`, al borrado de `.cache/` y a rebuilds de Docker (volumen dedicado). Las agregaciones de temporada y ventanas largas calculan sobre bucket + archivo, así jugar 100+ partidas en el acto ya no recorta la vista de agentes/mapas
- **Backfill profundo** (`POST /api/valorant/backfill`): pagina el historial competitivo más allá del bucket y lo archiva; una pasada (default 40 páginas ≈ 400 partidas) y no se repite salvo `force=1`
- Bucket de partidas por jugador con **sync incremental**: un refresh sin novedades cuesta 1 request; el historial se pagina solo al profundizar ("Cargar más": 10 → 20 → 40)
- Refresco SWR: Actualizar dispara la revalidación en segundo plano (`POST /api/valorant/refresh`) y la UI sondea `window.syncedAt` sin gastar cuota
- Throttle 24 req/min + espaciado mínimo de 1.8 s (respeta límite de Henrik Basic: 30/min)
- Cron opcional (`VAL_BACKGROUND_REFRESH=1`, ver `.env.example`): sincroniza los **perfiles visibles** en background para que abrir el dashboard cueste $0 requests
- **Aviso semanal de reglas por Web Push** (lunes; `VAL_RULES_PUSH=0` lo apaga; acepta el nombre viejo una versión): resume los cortes ignorados y violaciones de pool de la semana anterior del perfil principal del **admin**
- **Vigilancia de tienda por usuario** (cron): refresca la tienda de cada usuario con favoritas + push y avisa solo a sus dispositivos (dedupe diario por usuario)
- **Anti-spam de "Actualizar"**: cooldown visible de 60 s en el botón (contador) y 10 s en servidor (`REFRESH_COOLDOWN_SEC`), deshabilitado mientras la contraseña sea temporal
- Zona horaria configurable con `TZ` (default `UTC`; ver `.env.example`)

## Stack

Next.js 16 (App Router, standalone) · React 19 · TypeScript · TanStack Query v5 · CSS puro con design system propio · Docker multi-stage

## Configuración de llaves (`.env`)

Las llaves **viven solo en archivos `.env` locales** — están en `.gitignore` y nunca se suben al repo. Cada proyecto tiene su plantilla `.env.example`.

### Paso a paso

```bash
# 1. Crear el .env desde la plantilla
cp .env.example .env
```

### 2. `RIOT_API_KEY` — requerida (dev key)

1. Login en <https://developer.riotgames.com> con tu cuenta Riot
2. Panel → **DEVELOPMENT KEY** → *Generate* (⚠️ expira cada 24 h)
3. Pégala como `RIOT_API_KEY=RGAPI-...`

> En dev, `VAL-MATCH-V1` responde 403: `RIOT_MATCH_SOURCE=mock` sirve fixtures
> con la forma exacta de producción (generados desde `data/archive` con
> `node scripts/gen-riot-fixtures.mjs`). `VAL_NAME=AlexRomero12`,
> `VAL_TAG=LAN` y `VAL_SHARD=latam` ya vienen configurados.

### 3. Fixtures del mock (solo dev)

```bash
node scripts/gen-riot-fixtures.mjs          # regenera desde tu archivo real
node scripts/gen-riot-fixtures.mjs Nombre TAG 12
```

### 4. Resto de variables

| Variable | Default | Descripción |
|---|---|---|
| `RIOT_API_KEY` | — | Dev key (24 h) hoy; production key al aprobar Riot |
| `RIOT_MATCH_SOURCE` | `mock` | `mock` (fixtures) \| `live` (key productiva) |
| `VAL_NAME` / `VAL_TAG` | `Player` / `0000` | Riot ID de la cuenta única (AlexRomero12#LAN) |
| `VAL_CLUSTER` / `VAL_SHARD` | `americas` / `latam` | Routing oficial: cluster de cuenta y plataforma del match API |
| `VAL_BACKGROUND_REFRESH` | `0` | `1` activa el cron que sincroniza las partidas y alimenta el archivo |
| `VAL_REFRESH_INTERVAL_MIN` | `15` | Intervalo del cron en minutos |
| `VAL_RULES_PUSH` | `1` | `0` apaga el aviso semanal de reglas por Web Push |
| `ARCHIVE_DIR` | `data/archive` | Directorio del archivo acumulativo de partidas (persistente, externo al cache) |
| `TZ` | `UTC` | Zona horaria IANA del contenedor (afecta cortes de día de Reglas y timestamps) |
| `DATA_DIR` | `data` | Datos persistentes de la app: perfil, comentarios, suscripciones push (externo al cache) |
| `REFRESH_COOLDOWN_SEC` | `10` | Cooldown servidor entre refrescos |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | — | Web Push (`npx web-push generate-vapid-keys`) |

## Seguridad

- `.env`, `.env.*` y llaves (`*.key`, `*.pem`) están excluidos vía `.gitignore`
- Antes de cada commit se puede revisar con: `git diff --cached | Select-String "RGAPI-|HDEV-"` (debe devolver vacío)
- Si una clave llegara a filtrarse: revócala inmediatamente (dashboard de Henrik / portal de Riot)

## Correr

```bash
# Docker (recomendado)
docker compose up -d --build        # http://localhost:4321

# Local
npm install && npm run dev          # http://localhost:3000
```

O ejecutar `iniciar.bat` en Windows (Docker primero, fallback local).

**Tests**: `npm run test` (Vitest) cubre la agregación de stats (`lib/stats.ts`) y los nombres de rango (`lib/ranks.ts`).

**Producción (VPS + HTTPS)**: ver [docs/despliegue.md](./docs/despliegue.md) —
Oracle Cloud Always Free (ARM) con `docker-compose.prod.yml` + Caddy
(Let's Encrypt automático) y backups con `scripts/backup.sh`.

## API interna

| Endpoint | Descripción |
|---|---|
| `GET /api/valorant/summary?days=N&player=perfilId&limit=` | Resumen ranked agregado (`limit` = profundidad 1-40, default 10) |
| `POST /api/valorant/refresh?player=perfilId&scope=all\|matches&limit=` | Revalidación en background del bucket/cuenta; responde `{started:true}` |
| `POST /api/valorant/backfill` | Ya no existe backfill profundo: la API oficial no pagina historial (responde `PROVIDER_UNSUPPORTED`) |
| `GET /api/valorant/backfill` | Estado del archivo por cuenta: total archivado y rango de fechas |
| `GET /api/valorant/profiles` | Perfil único (Riot ID, rol, reglas de sesión) |
| `POST /api/valorant/profiles` | `{action: upsert, profile}` — actualiza el perfil |
| `GET /api/valorant/match?id=&player=perfilId` | Detalle completo de una partida cacheada |
| `GET /api/valorant/agents` | Catálogo de agentes con iconos y rol (cache 24 h) |
| `GET /api/valorant/status?player=perfilId` | Estado de proveedor/key/cuenta y origen (mock/live) |
| `POST /api/push/subscribe` / `DELETE ?endpoint=` | Suscripción Web Push |
| `POST /api/push/test` | Envía una notificación de prueba |
| `GET /api/valorant/tiers` | Badges oficiales por tier (iconos de rango, cache 7 días) |
| `GET /api/valorant/rules-history` | Snapshots guardados de días evaluados (con versión de reglas) |
| `POST /api/valorant/rules-history` | `{days:[...]}` — guarda/actualiza snapshots de días completos |
| `GET /api/valorant/comments` | Notas por partida |
| `POST /api/valorant/comments` | `{matchId, text}` — guarda o borra (texto vacío) la nota |

## Notas

- El perfil vive en `data/profiles.json` (volumen `valo-data`), single-user
- **Sin RR/MMR**: la API oficial no lo expone; las reglas y el progreso usan récord V/D/E, K/D y tier
- Las partidas cacheadas son inmutables: reabrir un detalle cuesta $0$ requests
- `VAL-MATCH-V1` requiere key productiva; en dev se sirve del **mock** (fixtures generados desde tu archivo real con `scripts/gen-riot-fixtures.mjs`)
- Al llegar la key productiva: `RIOT_MATCH_SOURCE=live` y validar paridad mock↔live por `matchId`
- Las partidas nuevas se archivan solas en cada sync (cron o refresh)
- El archivo vive en `data/archive/` — borrar el cache (`.cache/`) NO lo afecta
