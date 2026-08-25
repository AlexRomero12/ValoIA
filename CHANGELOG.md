# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

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
