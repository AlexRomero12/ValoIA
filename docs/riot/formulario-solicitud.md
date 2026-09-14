# Formulario · New Product Application (Riot Developer Portal)

> Copia y pega cada valor (el formulario está en inglés). Campos con `*` son
> obligatorios. No marcar nada de torneos.
>
> **La descripción tiene un límite de ~1.500 caracteres** (cortaba en 1.485).
> La versión de abajo ocupa **1.376** y deja margen.

| Campo | Valor |
|---|---|
| **Product Name*** | `ValoIA` |
| **Product Group*** | `Default Group` (o crea un grupo llamado `ValoIA`; solo hace falta si algún día sumas desarrolladores) |
| **Product URL*** | `https://valoia.duckdns.org` |
| **Product Game Focus*** | `VALORANT` |
| **Are you organizing tournaments?*** | `No` |

## Product Description* (pegar tal cual, 1.376/1.500)

ValoIA is a VALORANT performance dashboard. Users create an account, link their
Riot account with Riot Sign-On (opt-in) and see their own competitive stats: win
rate, K/D/A, ACS, ADR, HS%, agent and map breakdowns, session rules and a
round-by-round match timeline. By default only their own linked account is
visible. Comparisons with other players are strictly consent-based: a profile
is shown to third parties only if its owner linked Riot and enabled a public
profile; unlinking or revoking consent removes visibility immediately (audit
log kept). We do not expose opponent data before a match (no scouting), do not
display RR/MMR (not in the public API) and do not offer store tracking.

APIs: ACCOUNT-V1 (Riot ID to PUUID, active shard, /accounts/me via RSO),
VAL-MATCH-V1 (matchlist and full match details; third-party matches only with
opt-in), VAL-CONTENT-V1 (agents/maps content). Images come from
valorant-api.com; no Riot assets are redistributed. Live at
https://valoia.duckdns.org with Terms of Service and Privacy Policy, free tier
and RSO opt-in. With a development key VAL-MATCH-V1 returns 403, so the demo
shows clearly labeled sample data generated from the developer's own matches
using the production schema; after approval we switch to live data. Monetization,
if any: ads on the free tier and optional premium analysis features; no player
data is sold.

## VALORANT API Requirements Acknowledgement (marcar TODAS)

| Declaración | Marcar | Por qué |
|---|---|---|
| Leí la documentación de VALORANT y entiendo los requisitos | ✅ | Revisada y aplicada en el producto |
| No es para uso personal, educativo, pruebas ni un grupo pequeño de amigos | ✅ | Producto público: landing, registro abierto, perfiles con opt-in; sin flujo de aprobación de amigos |
| No desarrollaré un **item store checker** | ✅ | La Tienda se **eliminó** del producto (rama y sitio desplegado) |
| Entiendo que la API no da datos en tiempo real ni esports profesional | ✅ | No se usan datos en vivo ni de esports |
| No se recopila info de jugadores ni se muestran stats sin **OAuth con RSO** | ✅ | Diseño RSO ya implementado (`lib/identity/rso.ts`); el perfil es privado por defecto y solo se muestra con vinculación + opt-in explícito. La demo usa un proveedor *mock* con la **cuenta del propio desarrollador** porque las credenciales RSO se entregan tras la aprobación |
| La aplicación incluye un **prototipo funcional** o flujo visual | ✅ | `https://valoia.duckdns.org` en vivo (registro → vincular Riot → consentimiento → dashboard) |
| Los sitios WIP están **públicos** o se entregan **credenciales** | ✅ | Sitio público + credenciales demo abajo (Riot no crea cuentas) |

### Credenciales para el revisor (incluir en el mensaje de la solicitud)

El formulario no tiene campo de notas: envía las credenciales por **mensaje del
portal** en la app (App ID 881084) o por ticket en
`support-developer.riotgames.com`.

```
Demo: https://valoia.duckdns.org/login
User: valoia-demo
Pass: ValoIA-Demo-2026!
```

Además, la landing tiene un botón **“Ver demo (datos de ejemplo)”** que abre la
cuenta demo **sin credenciales** (`https://valoia.duckdns.org` → botón), pensado
para que el revisor no tenga que crear cuenta. La cuenta demo es de solo
lectura: no puede borrar la cuenta, cambiar contraseña, desvincular Riot ni
cambiar el consentimiento.

La cuenta demo ya está creada y con el flujo completo hecho: vinculada a la
identidad demo (AlexRomero12#LAN, proveedor *mock*), consentimiento aceptado,
perfil público activo y dashboard con 83 partidas de ejemplo claramente
etiquetadas como datos de demostración.

## Después de enviar

1. `https://valoia.duckdns.org/riot.txt` ya sirve el token de verificación de
   Riot (`d56eddd3-6f2b-4f4b-88b4-20aa9f77f478`); pulsa **Verify URL** en el
   portal.
2. Adjuntar capturas/video (ver `runbook-publicacion.md`, sección 4).
3. La espera real es de **3–8 meses**; no edites la solicitud mientras está en
   cola. RSO se habilita después de la aprobación (Riot contacta por app
   messages).
