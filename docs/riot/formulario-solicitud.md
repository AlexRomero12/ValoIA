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

## Después de enviar

1. Riot puede pedir la verificación del dominio: `https://valoia.duckdns.org/riot.txt`
   ya responde, pero hay que reemplazar el placeholder
   `PENDING-RIOT-VERIFICATION-TOKEN` por el token exacto que entregue Riot.
2. Adjuntar capturas/video (ver `runbook-publicacion.md`, sección 4).
3. La espera real es de **3–8 meses**; no edites la solicitud mientras está en
   cola. RSO se habilita después de la aprobación (Riot contacta por app
   messages).
