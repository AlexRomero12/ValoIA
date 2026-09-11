# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [1.13.0] — 2026-09-11

Experiencia de usuario: acceso claro, perfiles explicados, auditoría guiada, export/import, ayudas inline y Comparar en tarjetas.

### Added
- **Login claro**: qué es ValoIA, aviso de aprobación con pasos (envías → el admin aprueba → contraseña temporal), ayuda "¿Olvidaste tu contraseña?" y estado "pendiente de aprobación" (sin correos)
- **Contraseñas**: requisitos visibles (mín. 8, ideal frase de 12+), repetir contraseña con validación y botón ver/ocultar en login y cambio
- **Bloqueo por contraseña temporal**: aviso destacado que explica que todo queda bloqueado hasta cambiarla (Ranked/Comparar/Team/Tienda/Auditoría), botón que baja al formulario, y acciones de perfiles/administración deshabilitadas
- **Rol del perfil como multi-select** (Duelist/Initiator/Controller/Sentinel) con explicación de para qué sirve (composiciones de Team)
- **Auditoría guiada**: panel explicativo (qué mide, cómo, dónde se configura) y **propuesta inicial de reglas** calculada de tus partidas (pool por mapa, prohibidos por WR, metas del plan) con vista previa y aplicación en un clic
- **Export/import de perfiles**: archivo `.valoia.json` con etiqueta, Riot ID, cuentas, preferencias y reglas (sin RSO ni notas); importar crea perfiles nuevos respetando el tope
- **Ayudas inline `(?)`** en los KPIs (WR, K/D, ACS, HS%, ADR, FB, FD) y renombres: "Ventana" → "Periodo", "Cont" → "Parada", "Auditoría" → "Reglas de sesión" (nav "Reglas") y "Team" → "Equipo"
- **Winrate · Agente colapsable**: muestra los 6 agentes más jugados con botón **Ver más (N agentes más)** / **Ver menos** para desplegar el resto, dejando el panel a la par de **Winrate · Mapa**; añade una pista de que cada fila filtra «Partidas recientes»
- **Comparar en móvil**: filtros colapsables con contador (Periodo y Métrica siempre a la vista), selector de perfiles en chips que envuelven, **Ranking en tarjetas** por jugador con orden por selector y badge «mejor en…», pestañas **Resumen | Agentes** y agentes en tarjetas con sub-vista **Por jugador / Por agente**; iconos de agente de 40px

### Changed
- **Agentes en tarjetas también en escritorio**: el heatmap y la tabla de detalle se sustituyen por las vistas **Por jugador / Por agente** en todos los tamaños (el sub-toggle ya no es solo móvil), con tarjetas de altura uniforme, pie de resumen por agente (partidas, WR global y mejor jugador) y filas de jugadores a 2 columnas en escritorio
- **Orden en Ranked**: «Partidas recientes» pasa delante de Arsenal y Trend de rango (menos scroll hasta el detalle)
- Los endpoints de summary/status/refresh/backfill responden `404 NO_PROFILES` cuando el usuario aún no tiene perfiles (antes podían caer en los de otro al no haber propios)

### Fixed
- Feedback visual de chips seleccionados (roles prohibidos, Visible): el estilo solo existía dentro de `.player-chips`
- Botones primarios encogidos en móvil por una regla del TopBar que aplicaba a todos los `button.primary-*`
- Banner de bloqueo con hueco vertical en móvil (el `flex-basis` de la versión fila se interpretaba como altura)
- Botón "Actualizar" con cooldown de 60 s anti-spam y contador visible; deshabilitado mientras la contraseña es temporal
- **Aislamiento estricto de perfiles**: cada usuario (incluido el admin) ve y edita solo los suyos; antes el admin veía los de todos y quien no tenía perfiles podía terminar operando sobre el del admin
- **Borrar cuentas alternativas**: al eliminar todas, el servidor las restauraba (el array vacío se trataba como «sin cambios»); ahora se guarda la lista vacía (mismo arreglo en las preferencias de agente por mapa)
- **FB/FD en perfiles multi-cuenta**: el merge de cuentas no recalculaba el impacto y las tarjetas FB/FD desaparecían en Ranked; ahora se promedian sobre las partidas unidas (como en el resumen de una sola cuenta)
- **Flechas de los desplegables de Auditoría**: "¿Qué son las reglas de sesión…?" y "Propuesta de reglas" usaban marcadores distintos; ahora comparten el mismo chevron que rota al abrir

## [1.12.0] — 2026-09-11

Vistas adaptadas a móvil, PWA instalable y vista previa de enlaces.

### Added
- **Adaptación móvil completa**: barra HUD inferior (Ranked, Comparar, Team, Tienda, Auditoría; Perfiles en el menú de usuario), TopBar compacta, tarjetas de partidas en Ranked, tablas comparativas con scroll real + primera columna fija, gráficos SVG recalculados al ancho real (`useElementWidth` + modo compacto), auditoría con detalle al toque y slot mínimo por partida, modales como bottom sheets, objetivos táctiles de 44px y safe-area
- **PWA instalable** (sin service worker): `app/manifest.ts`, iconos 192/512/maskable + apple-touch-icon y metas iOS (`appleWebApp`) para añadir a pantalla de inicio
- **Vista previa de enlaces (Open Graph/Twitter)**: imagen 1200×630 de marca, metadata completa con `metadataBase`, y rutas de assets públicos exentas de sesión en el proxy (los crawlers deben poder leerlas)
- `scripts/generate-brand-assets.ps1`: regenera iconos PWA e imagen OG con la identidad del dash

### Changed
- `viewport` explícito (`viewport-fit=cover`, `interactiveWidget: resizes-content`, theme color), `100dvh` en login/modales y `overflow-x: clip` global
- Los tooltips solo-hover de los gráficos (Tier, Tendencia, Auditoría) se reemplazan en móvil por selección al toque con lectura de datos
- Eliminado el CSS muerto `app/page.module.css`

## [1.11.0] — 2026-09-10

Seguridad multiusuario completa: sesiones revocables, altas con aprobación y tienda/favoritas/push por usuario.

### Added
- **Despliegue en producción**: `docker-compose.prod.yml` (valo-dash sin exponer + Caddy con HTTPS automático) y `Caddyfile` con `X-Real-IP` + HSTS; guía paso a paso en `docs/despliegue.md` (Oracle Always Free ARM, firewall de dos capas, DNS, backups y actualizaciones)
- **Backups**: `scripts/backup.sh` (volúmenes `valo-data` + `valo-archive`, retención de 14) listo para cron
- **Sesiones revocables**: registry `data/sessions.json` con `sid` firmado (dispositivo, IP, último uso); topes de 5 por usuario y 3 por IP (revoca la más antigua); al cambiar contraseña o borrar usuario se revocan sus sesiones; pestaña **Sesiones** con cerrar una o “las demás” (el admin ve todas)
- **Solicitudes de acceso con aprobación**: formulario público en `/login` (rate-limit 3/h por IP), panel admin con **Aprobar** (crea usuario con contraseña temporal y cambio forzado) / **Rechazar**; se muestra la temporal una sola vez y se registra la IP de creación
- **Cambio forzado de contraseña** (`mustChangePassword`): el proxy solo deja cambiarla y salir hasta que se actualice
- **Rate-limit de login** por IP+usuario (5/10min), por usuario (10/15min) y por IP (30/15min) con `Retry-After`; **cooldown de refresh** de 10s por usuario; **backfill solo admin**
- **Endurecimiento**: `Origin` propio en mutaciones, headers de seguridad (`X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`), IP real con `TRUST_PROXY` (X-Real-IP / última XFF), contraseña ≤128, `next` del login sanitizado y hash dummy de mismo costo
- **Actividad** (`data/auth-log.json`, últimos 500 eventos): logins ok/fallo/bloqueo, altas/bajas, cambios de contraseña, solicitudes y aprobaciones — visor en el panel admin
- **Límites de uso**: máx. 10 perfiles por usuario (20 el admin)
- **Tienda RSO por usuario**: `data/rso/<usuario>.json` y cache por usuario; **favoritas** `data/favorites.<usuario>.json`; **push con dueño** y envío filtrado; vigilancia del cron por usuario (avisa solo a sus dispositivos); al borrar un usuario se limpian sus favoritas, RSO, push y dedupe
- **Primer uso**: aviso en Tienda si aún no hay perfil principal (con enlace a Perfiles)
- Escrituras **síncronas atómicas** para stores pequeños (sesiones, usuarios, favoritas, push, comentarios, log, solicitudes): elimina carreras read-after-write entre bundles del server

### Changed
- **Fuera la vía local del Riot Client** (lockfile, `tools/riot-proxy.js`, mounts de Docker y `STORE_LOCAL_HOST`/`RIOT_*`): la tienda es 100% RSO — requisito para desplegar en Linux/ARM (Oracle/Hetzner)
- La tienda y las notificaciones dejan de ser del admin: **cada usuario conecta su RSO**; el admin no ve tiendas, favoritas ni notas ajenas
- El perfil **principal ahora es por dueño**; migraciones automáticas: `rso.json` → `rso/<admin>.json`, `favorites.json` → `favorites.<admin>.json`, push legacy → admin; perfiles/usuarios viejos heredan dueño/admin
- Fuentes vía `next/font` (Anton + Chakra Petch self-hosted) y **lint a 0 warnings** (variables sin uso, `no-location-assign`, `<img>` justificado)

## [1.10.0] — 2026-09-10

Aislamiento por usuario: cada quien con sus perfiles, el admin con todo.

### Added
- **Dueño por perfil**: cada usuario ve y edita solo sus perfiles en Ranked, Comparar, Team, Auditoría y Perfiles; el **admin** ve todos (con el dueño marcado) y las rutas de datos responden 403 si pides un perfil ajeno
- **Admin** (el primer usuario): gestiona usuarios (crear, borrar, cambiar contraseñas), conecta la Tienda/RSO y es el dueño del push semanal; los usuarios normales solo cambian su propia contraseña
- **Migraciones automáticas**: usuarios previos sin flag admin → el más antiguo; perfiles sin dueño → el admin
- Filtrado por dueño en snapshots de auditoría y en el detalle de partida (solo busca entre tus cuentas)
- **Notas por partida con autor**: cada usuario ve solo las suyas (el admin ve todas; las previas al flag quedan como del admin)

### Changed
- `primary` es por dueño (cada usuario su principal para Auditoría); la Tienda usa el principal del admin
- **Tienda solo para el admin** (la sesión de Riot es única): se oculta del nav y la página avisa al resto
- `GET /api/auth/session` informa `admin`; `/api/store/auth` queda restringido al admin

## [1.9.0] — 2026-09-10

Acceso con login y usuarios: la app deja de estar abierta para poder publicarla.

### Added
- **Login con usuarios** (`/login`): toda la app queda detrás de sesión con `proxy.ts` (convención de Next 16; runtime Node). Páginas sin sesión redirigen a `/login?next=…`; APIs responden 401; `/sw.js` y estáticos quedan libres
- **Usuarios** en `data/users.json` (volumen `valo-data`): hash **scrypt** con sal por usuario, nunca la contraseña; primer usuario sembrado desde `AUTH_USER`/`AUTH_PASSWORD`; panel **Usuarios** en `/perfiles` para crear, cambiar contraseña y borrar (nunca el propio ni el último)
- **Sesiones firmadas** (HMAC-SHA256 con `AUTH_SECRET`) en cookie `HttpOnly` + `SameSite=Lax` (+ `Secure` con HTTPS), 30 días; `/api/auth/session` y botón **Salir** en el TopBar
- **Rate-limit** de login: 5 intentos / 10 min por IP+usuario; comparación en tiempo constante
- `GET|POST /api/auth/users`, `POST /api/auth/login|logout`, `GET /api/auth/session`

### Changed
- `.env.example` documenta `AUTH_SECRET`, `AUTH_USER` y `AUTH_PASSWORD`; en producción sin `AUTH_SECRET` el login avisa con un error claro en vez de fallar en silencio

## [1.8.0] — 2026-09-10

Perfiles personalizables (adiós a los perfiles fijos), auditoría por persona y fuera Aim Lab.

### Added
- **Perfiles gestionables (`/perfiles`)**: Riot ID, etiqueta, rol, color, cuentas alternativas, preferencias de agente por mapa y flag **visible** (Ranked/Auditoría). Persisten en `data/profiles.json` (volumen `valo-data`, externo al cache). `GET|POST /api/valorant/profiles` (`upsert`/`delete`, nunca deja la lista vacía). La primera vez se siembra un perfil inicial desde `VAL_NAME`/`VAL_TAG` (o `Player#0000`) para no perder nada
- **Perfil principal (★)**: se elige en `/perfiles` (solo puede haber uno). Auditoría audita únicamente ese perfil, la Tienda muestra únicamente su tienda y el aviso semanal push es solo del principal
- **Reglas de auditoría por perfil** (`AuditRules`): pool **por mapa** (principal/backup) con selector de agentes por iconos, agentes y **roles prohibidos** (p. ej. `Initiator`), regla de parada parametrizable (N derrotas con K/D < X), pausa de sesión (minutos) y metas semanales (WR, K/D, ACS, HS%, ADR, FB≥FD). Copiar reglas entre perfiles e importar/exportar JSON
- **Recomendaciones de auditoría** con acción directa: violaciones recurrentes (con fecha de la última), reglas vs datos (sugiere subir/bajar agente con ≥5 partidas), RR evitable tras cortes ignorados, metas de la semana y mapas jugados sin regla
- **Snapshots de auditoría versionados por perfil**: clave `perfilId:fecha` + `rulesVersion` (editar reglas no reescribe el pasado); los snapshots viejos se migran a `player` automáticamente
- **Loader de cargas grandes** (`LoadingOverlay`): panel flotante con spinner, paso actual, progreso (perfil i/N confirmado) y cronómetro; overlay bloqueante en las cargas iniciales. Integrado en Ranked, Comparar, Team, Auditoría y Perfiles
- **Aviso semanal por Web Push** (`lib/auditWatch.ts`): lunes por la mañana resume los cortes ignorados y violaciones de pool de la semana anterior del **perfil principal** (dedupe semanal en `data/audit-notified.json`, `VAL_AUDIT_PUSH=0` lo apaga)
- **Comparar y Team con selección libre de perfiles** + botón “Agregar perfil” sin salir de la página; colores por perfil (propio o paleta) y stats de cuentas alternativas mezcladas como antes
- **Team para N jugadores**: con 4 reparte 1 rol por jugador como siempre; con otro número usa la mejor combinación libre respetando las reglas de composición

### Changed
- **Ranked combina todas las cuentas del perfil** (principal + alternativas): `mergeAccountSummaries` ahora recalcula `byAgent`/`byMap`/arsenal y el total de RR sobre las partidas mezcladas, así el WR por agente/mapa refleja todo lo que juega el jugador; el detalle de partida busca en todas sus cuentas
- **Ranked** ya no tiene chips fijos: muestra los perfiles marcados como visibles (con enlace directo a `/perfiles`)
- **Perfiles es la primera pestaña** de la nav (antes Ranked)
- **Auditoría** audita el **perfil principal** (se elige en `/perfiles`, sin selector en la página) y muestra la línea de reglas aplicadas (`Reglas de X · vN`); los badges de cada partida ahora distinguen `M` principal, `B` backup, `P` fuera de pool y `X` prohibido
- **Tienda**: solo se muestra la tienda del **perfil principal**; si la sesión conectada (Riot Client/RSO) es de otra cuenta, se avisa y no se enseña la tienda ajena (la vigilancia push tampoco notifica)
- El bucket de fondo (cron) calienta los perfiles visibles; el resumen semanal sale de los mismos datos cacheados ($0 extra)
- Endpoint de agentes ahora incluye el **rol** (para el editor de reglas)
- Migración de `lib/team.ts` a `lib/profileTypes.ts` + `lib/profiles.ts`; las rutas `summary/refresh/backfill/status` y el detalle de partida resuelven por id de perfil
- `/` redirige a `/valorant`; la nav suma **Perfiles** (primera) y pierde **Aim Lab**

### Removed
- **Aim Lab**: página `/`, `GET /api/data`, `lib/aimlab.ts`, `lib/analysis.ts`, `lib/useAimlabData.ts`, `lib/config.ts` y las variables `AIMLAB_*`

### Fixed
- **Gráfico de RR acumulado** (auditoría por día): eje con cero real — antes usaba `Math.abs` y +57 se dibujaba igual que −57 (abajo); ahora los positivos van sobre la línea de 0 y la línea "real" incluye las partidas posteriores al corte
- Snapshots de auditoría aislados por perfil (antes dos personas con partidas el mismo día compartían la misma clave)

## [1.7.3] — 2026-09-03
Auditoría de correctitud (20 bugs de la misma familia que el D1/D2): datos parciales,
mezclados o inventados que se mostraban como exactos.

### Fixed — gráfico RANGO
- Sin clamp de RR (Radiant y derank-protection ya no se aplanan) y `tierShort` cubre 27+ como RAD
- Un punto por partida en día/semana: las promociones y deranks intra-día ya no se ocultan
- Eje Y con piso dinámico (antes recortaba caídas bajo P3) y `TierChart` sin piso fijo ni tiers inventados para Unrated
- Eje X legible: una marca por día distinto (máx. ~10) en vez de una por punto, en el comparativo y en el gráfico de rango de Ranked, con separación mínima de 48 px entre marcas

### Fixed — números coherentes
- Heatmap con empates excluidos del WR (igual que el ranking) y récord con E
- Cobertura de RR en todas partes (`~` + tooltip: ranking, detalle por agente, historial diario, chip de Ranked, ventana del summary con `rrMissing`)
- Medallas solo en orden descendente y compartidas en empates
- ACS/ADR/HS% del comparativo desde totales crudos (igual que el diario); W-L muestra E
- Team: % mostrado = muestra mostrada (ya no mezcla préstamo con V-D crudo), empates excluidos del WR, récord con E

### Fixed — pipeline
- Sin huecos: las páginas profundas ya no se saltan cuando la página 0 es toda nueva
- Partidas incompletas ya no quedan stale para siempre (se reintentan y no se archivan a medias)
- Rango actual ordenado por fecha y filtrado por temporada; tramos sin historial marcados `tierApprox` (~)
- Refresh secuencial (menos 429), frescura por fuente (`mmrSyncedAt`) y el sondeo confirma cambios de MMR
- Backfill con techo ya no dice `skipped` falso; badge de ventana truncada; caché en disco con hash anti-colisiones (+ adopción del formato anterior sin tormenta de requests)

### Fixed — filtros y auditoría
- Keys semanales `w-AAAA-MM-DD` (orden correcto, unificadas con auditoría); filtro `to` inclusivo; cobertura calculada sin filtros
- Auditoría: costo de pool solo con pérdidas (las victorias suman en `violationGain`, tooltip con balance); snapshot restauran el split y el conteo guardado

## [1.7.2] — 2026-09-03

### Fixed
- **Métrica RANGO marcaba un tier menos en promociones (y ocultaba deranks)**: el `tier` por partida salía del detalle del match (tier *previo* al partido) pero el RR del `mmr-history` (post-partida); al promocionar se mostraba "D1 · 10" en vez de "D2 · 10". Ahora el tier post-partida del `mmr-history` es el autoritativo y va junto a su RR (`lib/valorant.ts`)
- Datos de un perfil refrescados tras un derank y su repromoción: el gráfico de evolución por día/semana ya culmina en el tier actual

## [1.7.1] — 2026-09-02

### Changed
- **Métrica RANGO en la evolución del Comparativo** (antes "ELO"): ahora grafica **tier + RR** (puntos de rango = tier × 100 + RR, continuo entre tiers) y formatea cada punto como "D1 · 20" en vez del MMR crudo. El **eje Y inicia en Platinum 3** con una línea de cuadrícula por tier (P3/D1/D2/D3…) para no perder detalle con rangos bajos vacíos. Motor en `lib/compare.ts` (`rankPointsOf`, `tierShort`, `RANK_AXIS_MIN`)

## [1.7.0] — 2026-09-02

Auditoría de sesión (reglas de parada y pool con costo en RR) + empates corregidos en todo el dash.

### Added
- **Página Auditoría (`/auditoria`)**: audita las competitivas del perfil principal contra sus **Reglas de sesión** — regla de parada (2 derrotas seguidas con K/D < 0.9 = cerrar sesión; solo una victoria reinicia, empates y derrotas con K/D ≥ 0.9 no reinician ni cancelan), violaciones de **pool** con su costo en RR, y sesiones (pausa ≥ 3 h = sesión nueva). Motor en `lib/audit.ts` (`AUDIT_POOL` configurable)
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
- **Multi-cuenta en Comparar**: `TeamMember.accounts` en `lib/team.ts` para mezclar las stats de un jugador que usa varias cuentas Riot
- `GET /api/valorant/summary|refresh` aceptan `account=<índice>` para consultar una cuenta concreta de un miembro; `mergeAccountSummaries` (lib/compare) une partidas deduplicadas por matchId y elige el rango de la cuenta mejor clasificada
- **Pestaña Team (`/team`)**: composición recomendada por mapa (estilo vlr.gg) — para cada mapa, qué agente juega cada jugador con su WR (fuente del dato marcada: mapa/global), rol del agente, uso pro del agente en el mapa, backups por jugador y WR del equipo en ese mapa. Ventanas temporada/7/14/30/90 días. Motor en `lib/comp.ts` con reglas: máx 2 jugadores por rol, nunca dos roles duplicados a la vez y prioridad a la meta profesional
- **Meta pro**: `lib/proneta.ts` con el pick rate por agente y mapa de VCT 2026 Americas Stage 2 (vlr.gg). Los agentes con uso pro ≥10% se premian (y se marca el % en la tarjeta); los que no se juegan pro en el mapa se penalizan −20 y solo salen si no hay opción mejor. Solo se muestran mapas en rotación (`ROTATION_MAPS`: Abyss, Ascent, Haven, Lotus, Split, Summit, Sunset)
- **Metodología de asignación (rol primero)**: los 4 roles se reparten entre los jugadores según su rol declarado (con flex cuando los datos no lo soportan) y dentro del rol se elige el mejor agente por WR×mapa+meta
- **Recencia**: WR ponderada por fecha (media-vida 90 días) — lo que juegas ahora pesa más que el histórico viejo; **propiedad**: el jugador que más volumen tiene de un agente lo conserva ("él es nuestro mejor Sova")
- **Preferencias manuales** (`TeamMember.prefs`): agente favorito por mapa que gana al score automático (p. ej. Chamber en Haven/Sunset). Si la preferencia de un mapa apunta a un solo rol (Chamber→Sentinel), el rol queda bloqueado para ese jugador; con varios roles queda flexible con bonus
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

Nueva vista Comparar: los perfiles del equipo lado a lado.

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
- Selector de perfiles visibles con recálculo total del dash
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
- Zona horaria del contenedor configurable con `TZ`

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
