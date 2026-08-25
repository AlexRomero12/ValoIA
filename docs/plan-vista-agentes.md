# Plan — Vista "Por agente" estilo VLR (Opción C)

> **Estado:** pendiente de implementación
> **Página afectada:** `/comparativo` · sección "Heatmap jugador × agente"
> **Estimación:** ~1.5 h · $0$ requests nuevos a Henrik

## Contexto

Referencia de diseño: [vlr.gg/stats](https://www.vlr.gg/stats) — tabla densa tipo spreadsheet con mini-barras proporcionales dentro de las celdas numéricas, iconitos de agentes inline y filtros por timespan/agente/mapa.

Decisión tomada: **Opción C** = heatmap compacto como resumen visual + nueva tabla analítica estilo VLR, ambas alimentadas por el mismo filtrado existente (sin tocar backend de Henrik).

## Decisiones de diseño (defaults)

| Decisión | Valor |
|---|---|
| Selección de agentes | **Multi-select** por iconitos clicables (vacío = todos) |
| Toggle inicial de tabla | **"Mejor de cada jugador"** (nace limpia; se puede cambiar a todas las combinaciones) |
| Orden inicial de tabla | WR% descendente |
| Rating compuesto | Fuera de alcance v1 (posible v2) |

## Alcance

### 1. Filtro de agentes como iconitos
- Endpoint nuevo `GET /api/valorant/agents` → `[{name, icon}]` desde `getContent()` (cache 24 h server-side)
- Hook `useAgentIcons()` (TanStack, staleTime 24 h)
- En `FiltersBar`: el dropdown de agente se reemplaza por fila de iconos circulares con anillo de selección; multi-select

### 2. Tabla detallada jugador × agente (`AgentStatsTable`)
- Fila = combinación jugador × agente respetando TODOS los filtros (mapa, fechas, temporada, mín. partidas)
- Columnas: Agente(icono) · Jugador(chip color) · Partidas · W-L · WR% · K/D · ACS · ADR · HS% · RR neto
- Look vlr: celda numérica con mini-barra horizontal de fondo proporcional al máximo de su columna
- Encabezados ordenables (patrón RankingTable)
- Toggle pill: `Todas las combinaciones` | `Mejor de cada jugador`

### 3. Heatmap se queda
Resumen compacto encima de la tabla. Retoques: icono del agente junto al nombre de cada fila; celdas respetan el multi-select.

## Cambios técnicos

| Archivo | Cambio |
|---|---|
| `lib/compare.ts` | `CompareFilters.agent: string` → `agents: string[]`; `applyFilters` filtra por conjunto |
| `lib/hooks.ts` | + `useAgentIcons()` |
| `app/api/valorant/agents/route.ts` | nuevo endpoint |
| `components/compare/AgentIconFilter.tsx` | nuevo componente de iconitos |
| `components/compare/AgentStatsTable.tsx` | nueva tabla con cell-bars |
| `components/compare/FiltersBar.tsx` | slot para filtro de íconos (fuera dropdown) |
| `app/comparativo/page.tsx` | estado `selectedAgents: Set<string>` + render de ambos views |
| `app/globals.css` | `.cellbar`, `.agent-icon-btn`, `.pill-toggle`, ajustes heatmap |

## Seguridad rate limit

$0$ requests nuevos a Henrik en el flujo normal — todo sale de los summaries ya cacheados más el catálogo de agentes (valorant-api.com, cache 24 h).

## Criterios de aceptación

- [ ] Iconitos de agentes visibles con su imagen oficial; click selecciona/deselecciona
- [ ] Tabla refleja multi-select + mapa + fechas + temporada + mín. partidas
- [ ] Mini-barras proporcionales al máximo de columna en WR/ACS/ADR/HS%
- [ ] Toggle "Mejor de cada jugador" deduplica correctamente
- [ ] Heatmap sigue funcionando con el nuevo modelo de filtros
- [ ] Build sin errores y desplegado en Docker
