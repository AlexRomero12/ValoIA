# ValoIA · Dashboard

Dashboard personal de rendimiento para VALORANT. Datos en vivo desde la API de HenrikDev (partidas, MMR, RR) con cache persistente, Docker y **perfiles configurables** (tú decides a quién ver y qué reglas aplicar).

> Estado actual: **v1.13.0** — ver [CHANGELOG.md](./CHANGELOG.md)

## Estructura

```
app/                  Páginas (/valorant, /comparativo, /team, /tienda, /auditoria, /perfiles) + API routes
components/           TopBar, KpiGrid, WrPanel, TierChart, MatchesTable, MatchDetailModal, LoadingOverlay, InfoTip
components/audit/     Auditoría: intro y propuesta de reglas, día auditado, recomendaciones con acción
components/compare/   Filtros, ranking, trend, heatmap, tabla jugador × agente y tarjetas móviles de agente
components/profiles/  Formulario de perfil, selector, editor de reglas de auditoría y selector de agentes
components/store/     Tienda de hoy, favoritas y panel de notificaciones
lib/                  Clientes Henrik/Riot, perfiles, agregación, auditoría, propuesta de reglas, export/import, cache L1+L2, hooks
docs/                 Planes de diseño de vistas
public/               Estáticos (incluye sw.js para Web Push)
```

## Features

### Acceso y seguridad
- **Login con usuarios**: la app entera queda detrás de sesión (`proxy.ts` de Next 16). Páginas sin sesión → `/login?next=…`; API → 401; `/sw.js` y estáticos quedan libres. El login explica qué es ValoIA y el flujo de alta (solicitud → aprobación → contraseña temporal)
- **Solicitudes de acceso con aprobación**: desde `/login` se puede pedir cuenta (rate-limit por IP); el admin aprueba/rechaza en **Perfiles → Solicitudes** y la aprobación genera una contraseña temporal con cambio forzado al entrar
- **Contraseñas**: mínimo 8 (mejor frase de 12+), repetir con validación y ver/ocultar; con contraseña temporal el **panel queda bloqueado** (solo Perfiles) hasta cambiarla, con aviso y acceso directo al formulario
- **Aislamiento por dueño**: cada perfil tiene `owner`; cada usuario (incluido el admin) ve y edita **solo sus perfiles** en Ranked, Comparar, Equipo, Reglas de sesión y Perfiles, sus favoritas, su tienda y sus notas. El admin solo añade la gestión de usuarios; **no ve perfiles, tiendas ni favoritas ajenas**
- **Sesiones revocables**: registry `data/sessions.json` con dispositivo/IP/último uso; tope 5 por usuario y 3 por IP; panel **Sesiones** para cerrar una o las demás; cambiar contraseña o borrar usuario revoca sus sesiones
- Contraseñas con **scrypt** + sal por usuario en `data/users.json`; sesiones firmadas **HMAC-SHA256** con `AUTH_SECRET` (cookie `HttpOnly` + `SameSite=Lax` + `Secure`, 30 días)
- **Límites**: login 5/10min por IP+usuario, 10/15min por usuario y 30/15min por IP (429 + `Retry-After`); solicitudes 3/h por IP; refresh 10s por usuario; máx. 10 perfiles por usuario (20 el admin); **backfill solo admin**
- **Endurecimiento**: `Origin` propio en mutaciones (CSRF), headers (`X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`), IP real con `TRUST_PROXY`, contraseña ≤128 y sanitización del `next`
- **Actividad** (`data/auth-log.json`, últimos 500): logins, altas/bajas, cambios y solicitudes, visible en el panel admin

### Página Ranked (`/valorant`)
- **Selector de perfiles visibles**: los que marques en `/perfiles` (el inicial se siembra desde `VAL_NAME`/`VAL_TAG`) — todo el dash se recalcula
- **Todas las cuentas combinadas**: KPIs, WR por agente y mapa, arsenal y trend se calculan sobre la unión de la cuenta principal + alternativas del perfil elegido (útil para ver todo lo que juega y dónde)
- **Rango con badges oficiales**: icono del tier con tooltip en el chip (con **RR dentro del rango** en vez de MMR crudo), en el eje Y del gráfico de tendencia y en el scoreboard del detalle
- KPIs vs metas del plan (WR ≥55%, K/D ≥1.05, ACS ≥220, HS% ≥25%, ADR ≥150) con ayuda `(?)` en cada tarjeta
- Winrate por agente y por mapa con íconos oficiales (click filtra las partidas); el panel de **agente muestra los 6 más jugados** con **Ver más/Ver menos** (el resto queda a un toque, sin estirar el layout)
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
- **Móvil ≤720px**: filtros colapsables con contador, ranking en tarjetas por jugador (WR grande, stats clave y «mejor en…») con selector de orden, pestañas **Resumen | Agentes** y, dentro de agentes, tarjetas con sub-vista **Por jugador** (agentes de cada uno, top 4 + ver todos) y **Por agente** (WR de cada jugador por agente, el heatmap en formato legible); heatmap y detalle con tablas quedan en escritorio

### Página Equipo (`/team`)
- **Composiciones por mapa** para los perfiles que selecciones (eligiendo desde `/perfiles` o con “Agregar perfil”)
- Con 4 jugadores reparte 1 rol por jugador; con otro número busca la mejor combinación libre respetando las reglas (máx 2 por rol, sin dos roles duplicados)
- Prioriza la meta pro (VCT) y las preferencias manuales agente-mapa del perfil; backups por pick

### Página Perfiles (`/perfiles`)
- **CRUD de perfiles**: etiqueta, Riot ID, **roles multi-select** (Duelist/Initiator/Controller/Sentinel), color, cuentas alternativas (stats mezcladas), preferencias agente por mapa y flags **visible** (Ranked) y **principal** (★)
- **Perfil principal**: solo puede haber uno; las Reglas de sesión auditan únicamente a él, la Tienda muestra únicamente su tienda y el push semanal es solo suyo
- **Reglas de sesión por persona**: pool por mapa (principal/backup) con selector de agentes por iconos, prohibidos (agentes y roles, p. ej. Initiator), regla de parada, pausa de sesión y metas semanales
- Copiar reglas de otro perfil y **exportar/importar perfiles** en un archivo `.valoia.json` (etiqueta, Riot ID, cuentas, preferencias y reglas; nunca RSO ni notas) — importar crea perfiles nuevos respetando el tope
- Persistencia en `data/profiles.json` (volumen `valo-data`, externo al cache)

### Página Reglas de sesión (`/auditoria`)
- Audita **solo el perfil principal** (se elige en `/perfiles`, sin selector aquí) contra sus reglas: pool por mapa (principal/backup/prohibido), regla de parada (N derrotas con K/D < X) y separación por sesiones (pausa configurable)
- **Guía integrada**: panel explicativo (qué mide, cómo funciona y dónde se configura) y **propuesta inicial de reglas** calculada desde tus últimas partidas (pool por mapa, prohibidos por WR y metas) con vista previa y aplicación en un clic
- Hero semanal con **RR real vs "Con regla" vs "Regla + pool"**, cortes totales/ignorados, fuera de pool y prohibidos
- Por día: barras de RR por partida (cinta de peligro en el corte, bandas de sesión), RR acumulado real vs plan, y tabla con badges `M`/`B`/`P`/`X` (principal/backup/fuera/prohibido) y CORTE AQUÍ
- **Recomendaciones con acción**: violaciones recurrentes, reglas vs datos (subir/bajar agente), RR evitable por cortes ignorados, metas de la semana y mapas sin regla — se aplican con un click
- **Notas por partida**: contexto propio en cada fila, persistente en `data/match-comments.json` (volumen `valo-data`, externo al cache)
- **Snapshots de días auditados por perfil** (`perfilId:fecha` + versión de reglas): las semanas viejas se reconstruyen desde la copia cuando la API ya no devuelve el RR

### Página Tienda (`/tienda`)
- **Tienda diaria por usuario**: cada uno conecta **su** Riot (cookie `ssid` desde `auth.riotgames.com`; el server renueva tokens solo cada hora) y ve su rotación de 4 skins + bundle destacado con precio/descuento/tiempo restante. Las tiendas, favoritas y notificaciones son **privadas** (el admin tampoco ve las ajenas)
- Si la sesión conectada no es la del perfil principal del usuario, se avisa y no se muestra la tienda ajena; sin perfil principal, invita a crearlo en Perfiles
- **Previsualización**: click en cualquier skin (tienda, bundle, favoritas o explorador) abre un lightbox con el render a tamaño grande y sus **variantes de color (chromas)** para cambiar el color en vivo
- **Skins favoritas persistentes por usuario**: explorador del arsenal completo por categoría de arma (Sidearms → Melee) con iconos, contador de skins por arma y búsqueda por nombre; snapshot denormalizado en `data/favorites.<usuario>.json` (volumen Docker `valo-data`, inmune al borrado del cache)
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
- **Aviso semanal de auditoría por Web Push** (lunes; `VAL_AUDIT_PUSH=0` lo apaga): resume los cortes ignorados y violaciones de pool de la semana anterior del perfil principal del **admin**
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
| `AUTH_SECRET` | — | **Obligatorio en producción**: firma las sesiones (32+ bytes). Genera con `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `AUTH_USER` / `AUTH_PASSWORD` | — / — | Usuario inicial: se crea en el primer login si no hay ningún usuario (contraseña mínimo 8) |
| `VAL_NAME` / `VAL_TAG` | `Player` / `0000` | Riot ID de la cuenta del `.env` (la usa el proveedor Riot de fallback y el seed inicial de perfiles) |
| `VAL_REGION` / `VAL_PLATFORM` | `na` / `pc` | Routing de Henrik (LAN comparte deployment con NA) |
| `VAL_BACKGROUND_REFRESH` | `0` | `1` activa el cron que sincroniza los perfiles visibles cada `VAL_REFRESH_INTERVAL_MIN` min y alimenta el archivo |
| `VAL_REFRESH_INTERVAL_MIN` | `15` | Intervalo del cron en minutos |
| `VAL_AUDIT_PUSH` | `1` | `0` apaga el aviso semanal de auditoría por Web Push (requiere Web Push configurado) |
| `ARCHIVE_DIR` | `data/archive` | Directorio del archivo acumulativo de partidas (persistente, externo al cache) |
| `TZ` | `UTC` | Zona horaria IANA del contenedor (afecta cortes de día de la auditoría y timestamps) |
| `DATA_DIR` | `data` | Datos persistentes de la app: perfiles, favoritas, suscripciones push, tokens RSO, notificaciones (externo al cache) |
| `STORE_SHARD` | `na` | Shard de `pd.a.pvp.net` para el storefront (latam/br/na → `na`) |
| `TRUST_PROXY` | `0` | `1` detrás de un proxy (Caddy/nginx): usa `X-Real-IP`/`X-Forwarded-*` para rate-limit y sesiones |
| `SESSION_MAX_PER_USER` / `SESSION_MAX_PER_IP` | `5` / `3` | Tope de sesiones simultáneas (se revoca la más antigua) |
| `MAX_PROFILES` / `MAX_PROFILES_ADMIN` | `10` / `20` | Tope de perfiles por usuario |
| `REFRESH_COOLDOWN_SEC` | `10` | Cooldown servidor entre refrescos por usuario |
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

**Producción (VPS + HTTPS)**: ver [docs/despliegue.md](./docs/despliegue.md) —
Oracle Cloud Always Free (ARM) con `docker-compose.prod.yml` + Caddy
(Let's Encrypt automático) y backups con `scripts/backup.sh`.

## API interna

| Endpoint | Descripción |
|---|---|
| `POST /api/auth/login` | `{username, password}` — inicia sesión (rate-limit + sesión revocable) |
| `POST /api/auth/logout` | Cierra la sesión actual |
| `POST /api/auth/request-access` | Solicitud pública de acceso `{username, message?}` (rate-limit por IP) |
| `GET /api/auth/session` | Usuario, admin y `mustChangePassword` |
| `GET /api/auth/users` | Lista de usuarios (admin: todos; usuario: el suyo) |
| `POST /api/auth/users` | `{action: create\|password\|delete, username, password, currentPassword?, mustChange?}` — gestión de usuarios |
| `GET /api/auth/sessions` | Sesiones activas propias (`?user=`/`?user=all`, admin) |
| `DELETE /api/auth/sessions?id=` | Cierra una sesión (propia; admin cualquiera) |
| `GET /api/auth/requests` | Solicitudes de acceso (admin) |
| `POST /api/auth/requests` | `{action: approve\|reject, id, password?}` — aprobar (devuelve temporal una vez) o rechazar |
| `GET /api/auth/log` | Actividad reciente (admin) |
| `GET /api/valorant/summary?season=current\|days=N&player=perfilId&limit=` | Resumen ranked agregado (`limit` = profundidad 1-40, default 10) |
| `POST /api/valorant/refresh?player=perfilId&scope=all\|matches\|mmr&limit=` | Revalidación en background del bucket/MMR/cuenta; responde `{started:true}` al instante |
| `POST /api/valorant/backfill?player=perfilId&mode=season\|all&maxPages=&force=` | Backfill profundo del historial (fire-and-forget); el detalle de cada partida vieja queda en el archivo |
| `GET /api/valorant/backfill?player=perfilId` | Estado del archivo por perfil/cuenta: total archivado, rango de fechas y último backfill |
| `GET /api/valorant/profiles` | Lista de perfiles guardados (Riot ID, rol, visible, reglas de sesión) |
| `POST /api/valorant/profiles` | `{action: upsert, profile}` / `{action: delete, id}` — CRUD de perfiles |
| `GET /api/valorant/match?id=&player=perfilId` | Detalle completo de una partida cacheada |
| `GET /api/valorant/agents` | Catálogo de agentes con iconos y rol (cache 24 h) |
| `GET /api/valorant/status?player=perfilId` | Estado de proveedor/key/cuenta |
| `GET /api/store/status` | Tienda de hoy + bundle + favoritas (con coincidencias y estado de notificación) + estado RSO/push; `?refresh=1` fuerza revalidación |
| `GET /api/store/catalog?q=\|weapon=` | Búsqueda en el catálogo de skins o todas las skins de un arma |
| `GET /api/store/weapons` | Armas agrupadas por categoría con iconos y contador de skins |
| `GET /api/store/chromas?id=` | Variantes de color (chromas) de una skin |
| `POST /api/store/favorites` | `{action: add\|remove, offerId}` — favoritas del usuario |
| `POST /api/store/auth` | `{action: cookie, ssid}` (y login/2FA) — conexión RSO del usuario |
| `GET /api/store/status` | Tienda del usuario (perfil principal, cuenta conectada, favoritas y push propios) |
| `POST /api/push/subscribe` / `DELETE ?endpoint=` | Suscripción Web Push del usuario conectado |
| `POST /api/push/test` | Envía una notificación de prueba a los dispositivos del usuario |
| `GET /api/valorant/tiers` | Badges oficiales por tier (iconos de rango, cache 7 días) |
| `GET /api/valorant/audit-history` | Snapshots guardados de días auditados por perfil (`perfilId:fecha`, con versión de reglas) |
| `POST /api/valorant/audit-history` | `{days:[...]}` — guarda/actualiza snapshots de días completos |
| `GET /api/valorant/comments` | Notas por partida del usuario (el admin ve todas) |
| `POST /api/valorant/comments` | `{matchId, text}` — guarda o borra (texto vacío) la nota de una partida (queda con autor) |

## Notas

- Los perfiles viven en `data/profiles.json` (volumen `valo-data`); borrar un perfil no borra sus partidas archivadas
- El RR/MMR se obtiene de `mmr-history`; la API oficial de Riot no lo expone
- Las partidas cacheadas son inmutables: reabrir un detalle cuesta $0$ requests
- El backfill de historial completo es **una vez por jugador**: con key Basic tarda ~1.8 s por página (40 páginas ≈ 2 min). Partidas anteriores a cuando Henrik indexó la cuenta no existen en ninguna API externa — nadie fuera de Riot puede recuperarlas
- Las partidas nuevas se archivan solas en cada sync (cron o refresh): el archivo crece sin costo extra de requests
- El archivo vive en `data/archive/` — borrar el cache (`.cache/` o el volumen `valo-cache`) NO lo afecta; solo se pierde si borras esa carpeta o su volumen (`valo-archive`)
- **Tienda RSO por usuario**: cada uno conecta su cookie `ssid` en la página Tienda (`data/rso/<usuario>.json`); los tokens duran ~1 h y se renuevan solos. Las favoritas (`data/favorites.<usuario>.json`) y las suscripciones push son privadas; al borrar un usuario se limpian sus datos
