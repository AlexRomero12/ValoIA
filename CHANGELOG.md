# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [1.7.0] — 2026-09-02

Auditoría de sesión (reglas de parada y pool con costo en RR) + empates corregidos en todo el dash.

### Added
- **Página Auditoría (`/auditoria`)**: audita las competitivas de Alex contra las **Reglas de sesión** del plan — regla de parada (2 derrotas seguidas con K/D < 0.9 = cerrar sesión; solo una victoria reinicia, empates y derrotas con K/D ≥ 0.9 no reinician ni cancelan), violaciones de **pool** (agente fuera del pool vigente de `champion_pool.md`) con su costo en RR, y sesiones (pausa ≥ 3 h = sesión nueva). Motor en `lib/audit.ts` (`AUDIT_POOL` configurable)
- Vista semanal: hero con RR real / **Con regla** / **Regla + pool**, cortes totales vs ignorados, conteo de fuera de pool, y por día un SVG con barras de RR por partida (marcador de violaciones, cinta de peligro en el corte, bandas por sesión) + gráfico de RR acumulado real vs plan + tabla con badge CORTE AQUÍ / no debiste jugarla
- **Notas por partida** (`lib/matchComments.ts`): contexto propio en cada fila de la auditoría — persistente en `data/match-comments.json` (volumen `valo-data`, externo al cache, atómico)
- **Snapshots de días auditados** (`lib/auditHistory.ts` + `GET|POST /api/valorant/audit-history`): al pasar el día con RR completo se guarda una copia denormalizada; cuando la API deja de devolver el RR de partidas viejas, la semana pasada se reconstruye desde el snapshot (marca "guardado" / "parcial")
- **Escritura atómica** en `lib/persist.ts` y `lib/archive.ts`: `.tmp` + rename — un crash a mitad de escritura nunca corrompe favoritas, comentarios, tokens RSO ni partidas archivadas
- Panel de Tienda: cabecera con la **ventana de rotación** de la tienda diaria (tiempo restante) y `price-tag` para los precios

### Changed
- **Los empates ya no cuentan como derrotas**: marcador igualado (14-14) = badge dorado **E** en historial, día y detalle; los días muestran `XV-YD-ZE`, el WR excluye empates y las rachas los ignoran. Aplicado en `lib/dayAnalysis.ts`, agregaciones de `lib/valorant.ts` (KPIs, winrate por agente/mapa, comparativo) y `lib/compare.ts` (stats y timeline); `draws?` en `ValKpis`/`GroupRow`/`Kpis`
- Rango actual (chip de Ranked, eje Y y comparativo) sale del `mmr-history` (`latestMmr[0]`) y no de la última partida del bucket — arregla rangos viejos cuando el bucket no ha sincronizado
- TopBar: nueva pestaña **Auditoría**

### Fixed
- **RSO respaldo de la tienda roto (400 BAD_CLAIMS)**: `setRsoState` escribía `data/rso.json` por la cola asíncrona, pero `rsoTokensFresh`/`rsoStatus` leían el archivo síncrono justo después del reauth — la lectura ganaba la carrera y devolvía los tokens viejos (expirados), que `pd.a.pvp.net` rechaza con `BAD_CLAIMS` ("Failure validating/decoding RSO Access Token"). El cron quedaba atascado en ese ciclo y la tienda caía a "none" hasta que abrías la página. Fix: espejo del estado en memoria (`rsoCache`); el disco sigue siendo atómico. Verificado forzando la expiración de tokens + refresh (reauth → tokens nuevos → storefront 200)

## [1.6.0] — 2026-09-01

### Added
- **Página Tienda (`/tienda`)**: tienda diaria (4 skins + bundle destacado con precio/descuento/tiempo restante), skins favoritas persistentes y notificaciones Web Push cuando una favorita aparece en la tienda
- **Fuentes de la tienda** (`lib/riotClient.ts`): HenrikDev eliminó la tienda individual en su API v4, así que se consulta a Riot directamente — (1) **API local del cliente de Valorant** vía lockfile (`%LocalAppData%\Riot Games\Valorant\Config\lockfile`, `STORE_LOCAL_HOST`/`RIOT_LOCKFILE`/`RIOT_LOCAL_PORT`), $0 y sin credenciales (requiere el juego abierto); (2) **respaldo RSO por Cookie Reauth**: se pega la cookie `ssid` de tu sesión en auth.riotgames.com (F12 → Application → Cookies) y el server renueva los tokens solo cada hora con ella (`data/rso.json`). El login programático user/pass quedó bloqueado por Riot (hCaptcha obligatorio en el flujo RSO)
- **Previsualización de skins** (`components/store/SkinPreview.tsx`): lightbox con el render a tamaño grande desde el explorador, las tarjetas de la tienda, los items del bundle y las favoritas; incluye **variantes de color (chromas)** con miniaturas para cambiar el color en vivo (`GET /api/store/chromas?id=`, índice `chromasByLevelId` en el catálogo)
- **Iconos de rango** (`components/TierIcon.tsx` + `GET /api/valorant/tiers`): badges oficiales por tier (valorant-api `/v1/competitivetiers`, cache 7 días) con el nombre como tooltip — en el chip de Ranked, el eje Y del gráfico de tendencia, el header y scoreboard del detalle de partida, y la tabla del Comparativo
- **RR en vez de MMR**: el chip de Ranked y la tabla del Comparativo muestran los puntos dentro del rango (`currentRR`, de `mmr-history[].rr`) en vez del elo crudo; el detalle queda en el tooltip
- **Catálogo de skins** (`lib/skins.ts`): skinlevels + armas de valorant-api.com, índice uuid→nombre/icono/arma cacheado 7 días, búsqueda por nombre (excluye niveles de evolución no comprables)
- **Favoritas persistentes** (`lib/favorites.ts`): `data/favorites.json` con snapshot denormalizado (nombre/icono/arma) — externo al cache, inmune a `invalidateAll` y al borrado de `.cache/`; volumen Docker `valo-data`
- **Web Push** (`lib/push.ts` + `public/sw.js` + `app/api/push/subscribe`): VAPID keys en `.env`, suscripciones en `data/push-subscriptions.json`, badge "¡EN TIENDA!" + precio sobre favoritas disponibles y marca "notificada" del día; botón **Enviar prueba** (`POST /api/push/test`) para verificar el pipeline sin esperar la rotación
- **Vigilancia en el cron** (`lib/storeWatch.ts` + `instrumentation.ts`): cada 60 min refresca el storefront y notifica por push cada favorita nueva en tienda (dedupe diario en `data/store-notified.json`, sin spam)
- `GET /api/store/status` (tienda + bundle + favoritas + estado RSO/push; `?refresh=1` fuerza revalidación), `GET /api/store/catalog?q=|weapon=`, `GET /api/store/weapons`, `GET /api/store/chromas`, `POST /api/store/favorites`, `POST /api/store/auth` (login/2FA/cookie), `POST|DELETE /api/push/subscribe`
- Docker: volumen `valo-data` + montajes de solo lectura a los Config del cliente de Valorant y del Riot Client del host para los lockfiles

### Changed
- `TopBar` con enlace **Tienda**; `docker-compose.yml` añade `STORE_LOCAL_HOST=host.docker.internal`, `RIOT_LOCKFILE`, `RIOT_GAME_LOCKFILE` y `RIOT_LOCAL_PORT=56080`
- **Explorador de arsenal** en Favoritas: modal con categorías de arma (normalizadas: Pistols→Sidearms, Sniper Rifles→Snipers, Heavy Weapons→Machine Guns, EEquippableCategory::Melee→Melee), fila de armas con icono oficial y contador de skins, y grid de TODAS las skins base (excluye niveles de evolución y variantes `(…)`) con estrella de favorita; `GET /api/store/weapons` + `GET /api/store/catalog?weapon=`
- Vía local de la tienda: usa el lockfile del cliente de **Valorant** (el Riot Client da tokens sin permisos del storefront, HTTP 404) y `tools/riot-proxy.js` como puente en el host (la API local solo acepta 127.0.0.1); `RIOT_LOCAL_PORT=56080`
- **Multi-cuenta en Comparar**: `TeamMember.accounts` en `lib/team.ts` para mezclar las stats de un jugador que usa varias cuentas Riot (prueba: Juan = ツJuanツ#lol + ツJuan#Rol + Patricklol444#NA1)
- `GET /api/valorant/summary|refresh` aceptan `account=<índice>` para consultar una cuenta concreta de un miembro; `mergeAccountSummaries` (lib/compare) une partidas deduplicadas por matchId y elige el rango de la cuenta mejor clasificada
- **Pestaña Team (`/team`)**: composición recomendada por mapa (estilo vlr.gg) — para cada mapa, qué agente juega cada jugador con su WR (fuente del dato marcada: mapa/global), rol del agente, uso pro del agente en el mapa, backups por jugador y WR del equipo en ese mapa. Ventanas temporada/7/14/30/90 días. Motor en `lib/comp.ts` con reglas: máx 2 jugadores por rol, nunca dos roles duplicados a la vez y prioridad a la meta profesional
- **Meta pro**: `lib/proneta.ts` con el pick rate por agente y mapa de VCT 2026 Americas Stage 2 (vlr.gg). Los agentes con uso pro ≥10% se premian (y se marca el % en la tarjeta); los que no se juegan pro en el mapa se penalizan −20 y solo salen si no hay opción mejor. Solo se muestran mapas en rotación (`ROTATION_MAPS`: Abyss, Ascent, Haven, Lotus, Split, Summit, Sunset)
- **Metodología de asignación (rol primero)**: los 4 roles se reparten entre los jugadores según su rol declarado (Alex duelista, NoMicr sentinel, Gengar controller, Juan iniciador — con flex cuando los datos no lo soportan) y dentro del rol se elige el mejor agente por WR×mapa+meta
- **Recencia**: WR ponderada por fecha (media-vida 90 días) — lo que juegas ahora pesa más que el histórico viejo; **propiedad**: el jugador que más volumen tiene de un agente lo conserva (ej. Juan→Sova → "él es nuestro mejor Sova")
- **Preferencias manuales** (`TeamMember.prefs`): agente favorito por mapa que gana al score automático (ej. Alex: Chamber en Haven/Sunset; Split: Sage/Raze/Jett). Si la preferencia de un mapa apunta a un solo rol (Chamber→Sentinel), el rol queda bloqueado para ese jugador; con varios roles queda flexible con bonus
- El reparto por roles se compara contra la búsqueda libre (flex) y gana la mejor suma — nunca se fuerza un relleno de 0 partidas si existe una comp real mejor
- El ranking de agentes usa WR con contracción por muestra (WR2p ≈ 80% realista) para no dejar que una racha pequeña domine, y presta al 35% el WR del agente en otros mapas cuando la muestra del mapa es chica
- Roles de agentes: el catálogo de contenido (`getContent`) ahora trae el rol de cada agente y los `MatchRow` llevan `agentRole` (fallback por nombre en `lib/roles.ts`)

### Fixed
- **Storefront 404**: Riot migró el endpoint a **V3** — `POST store/v3/storefront/{puuid}` con body `{}` (el v2 GET responde 404 para todos); diagnosticado vía issue #61/PR #62 de techchrism/valorant-api-docs
- **Descuento del bundle**: Riot envía `discountPercent` como fracción (0.2 = 20%); el badge ahora muestra `-20%` y no `-0.2%`
- **Cache de tienda**: conectar la cookie RSO o ganar tokens nuevos invalida el cache del storefront; el botón Actualizar de la página fuerza revalidación real (`?refresh=1`)
- Lint del repo en **0 errores** (`henrikFetch` tipado genérico, patrón `mounted` de React 19 corregido en MatchDetailModal, `tools/` excluido del lint)

## [1.5.0] — 2026-08-28

Filtros desde los paneles de winrate y Arsenal (uso de armas por perfil).

### Added
- **Arsenal · Uso de armas** por perfil (`components/ArsenalPanel.tsx`): kills por arma con barra de uso, K/D por arma y "con qué te matan" (muertes por arma). Derivado del kill feed del archivo acumulativo + bucket ($0 requests), filtrado por la misma ventana/temporada/jugador del resto del dash
- Íconos y categorías de armas en el catálogo de contenido (`getContent` ahora también carga `/v1/weapons` de valorant-api.com)
- **Los paneles de Winrate (two-col) filtran Partidas recientes**: click en un agente/mapa del panel aplica el filtro a la tabla (toggle), con fila resaltada. El estado de filtro se elevó a la página y `MatchesTable` pasa a ser controlado (`fMap`/`fAgent`/`onFilter`)
- `ValSummary.arsenal` (`ArsenalRow[]` kills/deaths/kd por arma) — omitido en el proveedor Riot

## [1.4.0] — 2026-08-28

Archivo acumulativo de partidas (modelo tracker.gg): el histórico ya no se pierde cuando el bucket rota a las 40.

### Added
- `lib/archive.ts`: archivo append-only por jugador con TTL infinito — una partida archivada nunca se pierde, aunque salga de la ventana de 40 de la API. Índice compacto por jugador (total, rango de fechas, marcador de backfill) con reconstrucción automática desde disco
- **Store externo al cache**: el archivo vive en `data/archive/` (configurable con `ARCHIVE_DIR`), inmune a `invalidateAll()`, al borrado de `.cache/` y a rebuilds de Docker (volumen dedicado `valo-archive` en docker-compose). `data/` ya estaba en `.gitignore`
- **Backfill profundo** `POST /api/valorant/backfill?player=&mode=season|all&maxPages=&force=`: pagina el historial competitivo más allá del bucket (default 40 páginas ≈ 400 partidas, tope 150) y archiva todo. Progreso persiste página a página (un corte por rate limit no pierde trabajo); una pasada cubierta no se repite salvo `force=1`
- **Backfill una vez**: cada sync del bucket (página 0 y páginas profundas) archiva automáticamente las partidas nuevas — costo $0 requests extra; el cron alimenta el archivo solo
- `GET /api/valorant/backfill?player=`: cobertura del archivo por jugador (total, más antigua, más nueva, último backfill)
- Agregaciones season/days sobre **bucket ∪ archivo** (`getValSummaryHenrik`): jugar 100+ partidas en el acto ya no recorta KPIs, WR por agente/mapa ni el comparativo
- `window.archivedMatches` en el summary: partidas en el archivo del jugador

### Changed
- Detalle de partida (`getMatchDetail`): ahora busca primero en el archivo acumulativo antes que en los buckets — abrir el detalle de una partida vieja archivada cuesta $0 requests
- Mensaje `NOT_CACHED` del detalle ahora sugiere el backfill para partidas muy antiguas

## [1.3.0] — 2026-08-27

Historial de partidas paginado y agrupado por día, con análisis diario.

### Added
- Historial agrupado por día: fila resumen por fecha (partidas, W-L, K/D, ACS, ADR y RR neto del día) que se expande para ver sus partidas
- **Análisis del día** al hacer click en la fecha: modal con WR/K/D/ACS/ADR/HS% exactos (agregados desde totales crudos, no promedios simples), RR neto, racha mayor, mejor/peor partida por ACS y desglose por agente y mapa
- Paginación por días en el historial (5 días por página) con controles Anterior/Siguiente
- `lib/dayAnalysis.ts`: agrupación y agregación diaria client-side ($0 requests)
- Campos crudos en cada partida (`score`, `damageDealt`, `headshots`, `shots`) para agregados exactos

## [1.2.0] — 2026-08-27

Optimización de carga bajo rate limit (sync incremental + SWR + cron opcional).

### Added
- Bucket de partidas por jugador (`henrik:matches:v2:{name}:{tag}`): sync incremental que compara `match_id`s; un refresh sin novedades cuesta **1 request** en vez de re-descargar todo el historial
- Endpoint `POST /api/valorant/refresh?player=&scope=all|matches|mmr&limit=`: dispara la revalidación en segundo plano (fire-and-forget) y responde al instante `{started: true}`
- Refresco SWR en el cliente: el botón Actualizar no bloquea; sondea el summary interno comparando `window.syncedAt` ($0 requests de Henrik) hasta que el servidor confirma
- Lazy-load de historial: primera carga con 10 partidas + botón "Cargar más partidas" (10 → 20 → 40) en Ranked y Comparar
- Cron opcional en `instrumentation.ts` (`VAL_BACKGROUND_REFRESH=1`, intervalo `VAL_REFRESH_INTERVAL_MIN`): mantiene los buckets calientes para que abrir el dashboard cueste $0 requests
- Ventanas/filtros/selector de jugador ya no disparan fetch extra: todo se calcula localmente desde el bucket

### Changed
- El refresh ya NO invalida la caché de todos los jugadores (antes `refresh=1` borraba `henrik:matches:*` completo); ahora la revalidación es quirúrgica por jugador
- Throttle Henrik: espaciado mínimo de 1.8 s entre requests además del límite de 24/min (el limiter penaliza ráfagas cortas)
- Cooldown del botón Actualizar reducido a 15 s (el coste real por refresh bajó de ~24 requests a ~3)

### Fixed
- Caché L2 disco rota en Windows: los `:` en las claves generaban nombres de archivo inválidos (NTFS/ADS) y ninguna entrada persistía; ahora se sanitizan a `_` y las escrituras fallidas se registran en el log

## [1.1.0] — 2026-08-25

Nueva vista Comparar: los 4 perfiles del cuarteto lado a lado.

### Added
- Página `/comparativo` con nav "Comparar" en la TopBar
- Ranking del equipo ordenable por columna (WR, K/D, ACS, ADR, HS%, RR neto) con umbral de mínimo de partidas
- Evolución comparada de WR/ACS/K/D/ELO en un solo gráfico, con granularidad por día o semana
- Heatmap jugador × agente y tabla analítica estilo VLR (mini-barras en celdas, modo todos/mejores combos)
- Filtro de agentes por iconitos (iconos oficiales de valorant-api.com), combinable con mapa y rango de fechas custom
- Rango de fechas custom dentro de la ventana consultada, con leyenda de cobertura de datos
- Endpoint `GET /api/valorant/agents` (catálogo de agentes, cache 24 h) y hook `useAgentIcons`
- Plan de diseño de la vista en `docs/plan-vista-agentes.md`

### Fixed
- Leyenda de cobertura de datos encimada sobre los iconos de agentes (margen negativo → separación propia)

## [1.0.0] — 2026-08-25

Migración completa a Next.js y consolidación de todas las features del dash.

### Added
- Selector de perfiles del cuarteto (Alex / NoMicr / Gengar / Juan) con recálculo total del dash
- Detalle de partida al hacer click en una fila: scoreboard de los 10 jugadores (ACS, daño±, créditos, loadout), timeline ronda por ronda con motivo (⚔ / 💥 / ✂ / ⏱), duelos de apertura y rivales que te eliminaron
- Filtro por temporada (`season=current`) además de ventanas de 7/14/30/90 días
- Columna RR por partida (± coloreado, tooltip con RR en rango y Elo) y RR neto por ventana
- Íconos oficiales de agentes y mapas (valorant-api.com) en las tres tablas
- Metas del plan pintadas en verde partida a partida (K/D ≥1.05, ACS ≥220, ADR ≥150, HS% ≥25)
- Filtros por click en mapa/agente, combinables, con chips ✕ para limpiarlos
- Cache persistente en disco (L1 memoria + L2 archivos) con volumen Docker y dedupe de cargas en vuelo
- Cooldown de 60s en el botón Actualizar para proteger el rate limit
- Docker multi-stage (standalone) + `iniciar.bat` (Docker primero, fallback local)

### Changed
- Stack migrado de Astro SSR + vanilla JS a **Next.js 16 + React 19 + TanStack Query**
- Tipografía y design system unificados (Anton + Chakra Petch, paleta #0F1923/#FF4655 azul #35B6FF en Aim Lab)
- Proveedor de datos principal: HenrikDev API v4 (Riot oficial queda como fallback limitado)
- Zona horaria del contenedor fijada a America/Bogota

### Fixed
- Estilos que no aplicaban a DOM generado por JS (CSS scoped de Astro → globals)
- ACS/ADR divididos a la mitad por doble conteo de rondas
- Filtro de cola competitiva (Henrik usa `queue.id`, no `mode_type`)
- Región LAN enrutada como `na` en Henrik
- Horario de Aim Lab (filtro VT-only desactivado; muestra todos los escenarios)

### Removed
- Página Gym (Hevy) y toda su integración
- Scripts temporales de diagnóstico

## [0.1.0] — 2026-08-24

### Added
- Primer dashboard en Astro SSR: vista Aim Lab (sesión diaria, PBs, skills Voltaic, gráficos SVG) y vista Ranked inicial
- Integraciones Aimlabs GraphQL + Hevy
- Cache en memoria y catálogo de escenarios con ranks Voltaic

[1.1.0]: https://github.com/AlexRomero12/ValoIA/releases/tag/v1.1.0
[1.0.0]: https://github.com/AlexRomero12/ValoIA/releases/tag/v1.0.0
[0.1.0]: https://github.com/AlexRomero12/ValoIA/releases/tag/v0.1.0
