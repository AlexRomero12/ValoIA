# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

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
