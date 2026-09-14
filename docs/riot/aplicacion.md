# ValoIA — Riot Games API Production Key Application

> Submission language: English. Only **screenshots** are still pending; URLs and
> contact are filled in. This document is the source text for the Developer
> Portal "Register Product" form and the follow-up message.

## Product

**Name:** ValoIA
**Type:** Web application
**Games:** VALORANT
**Website:** https://valoia.duckdns.org
**Contact:** brayan12r@gmail.com

## Short description

ValoIA is a VALORANT performance dashboard for players. Users create an account,
link their Riot account via Riot Sign-On, and get an analysis of their own
competitive matches: win rate, K/D, ACS, ADR, HS%, agent and map breakdowns,
session rules and a match timeline. Comparisons with other players are only
possible when those players have linked their Riot account and explicitly
opted in to a public profile.

## Use case (approved category)

Training tools that allow players to view their own match histories and
aggregate stats, plus consented community comparisons.

- Self-stats: each user sees their own competitive match data.
- Community: a user's profile is **private by default**; it becomes visible to
  other registered users only after an explicit opt-in toggle, and it ceases to
  be visible immediately upon revocation or account deletion.
- Account linking is mandatory (RSO) before any personal data is shown.

## User flow

1. **Create account** — username + password (local account; used for settings,
   consent management and deletion).
2. **Connect Riot** — "Connect with Riot" starts Riot Sign-On (OAuth2
   authorization-code). We obtain PUUID, game name and tag from
   `/riot/account/v1/accounts/me`. We never see or store the Riot password.
3. **Consent** — explicit checkbox for data processing plus an optional
   "public profile" toggle (opt-in for third-party visibility). Each action is
   recorded in an append-only consent audit log (timestamp, policy version, IP).
4. **Dashboard** — Ranked, Team, Session Rules: own match history from
   `VAL-MATCH-V1` (+ `VAL-CONTENT-V1` for content, `ACCOUNT-V1` for identity).
5. **Compare** — a user can only select other profiles that have opted in.
   Players who never linked or opted in are never discoverable in the app.
6. **Revoke / delete** — one click to unlink Riot (visibility stops instantly)
   or to delete the account (profile, notes, push subscriptions and consent
   reference are purged from the application's stores).

## Current implementation status (honest disclosure)

- The application is fully functional against the Riot developer key for
  `ACCOUNT-V1`, `VAL-CONTENT-V1` and `VAL-STATUS-V1`.
- `VAL-MATCH-V1` returns 403 for developer keys, as documented. For the review
  period the dashboard serves **clearly labeled demonstration data**
  (`RIOT_MATCH_SOURCE=mock`) generated from the developer's own real match
  archive, matching the production `MatchDto` schema field-by-field. The moment
  the production key is approved, we flip `RIOT_MATCH_SOURCE=live` and validate
  parity mock↔live for the same match IDs.
- Riot Sign-On requires the RSO client credentials that Riot issues **after**
  production key approval. Until then, linking runs through a demo provider that
  simulates the exact same flow (UI, consent, visibility rules) using the
  developer's account. The real OAuth2 code path is already implemented behind
  the same interface (`RSO_ENABLED=1`).
- No RR/MMR data is shown or computed: we understand the official API does not
  expose it and that MMR/ELO calculators are not allowed.
- The store checker feature from earlier internal versions has been **removed**
  from this product.
- No scouting features: opponent stats are never shown pre-match.

## Compliance summary

- **Opt-in model:** public profiles require RSO link + explicit consent; the
  consent audit log is retained; revocation is immediate.
- **Data minimization:** account credentials (hashed), Riot ID + PUUID, match
  data, and consent records. No advertising, no data resale.
- **Security:** API key server-side only, HTTPS, sessions signed (HMAC) with a
  server secret, passwords hashed with scrypt, CSRF origin checks, rate limits.
- **Deletion:** self-service account deletion purges personal data.
- **Attribution:** the site states "ValoIA is not affiliated with or endorsed by
  Riot Games" and links to the Terms of Service and Privacy Policy.
- **Legal documentation:** Terms and Privacy Policy follow the structure and
  coverage of established third-party VALORANT stats services (OP.GG, Blitz,
  Tracker Network): GDPR Art. 6 legal bases per purpose, retention schedule by
  data category, strictly-necessary-cookies policy (no ad/analytics trackers),
  international transfers, GDPR/CCPA rights, minimum age policy, acceptable use
  (including a scraping/automation prohibition), IP ownership, copyright
  complaints, liability limitation and governing law/dispute resolution.

## Requested APIs

- `ACCOUNT-V1`, `VAL-MATCH-V1`, `VAL-CONTENT-V1`, `VAL-STATUS-V1`
- RSO client (OAuth2 authorization code) → requested after key approval

## Links (before submitting)

- Working site (HTTPS): https://valoia.duckdns.org
- Terms of Service: https://valoia.duckdns.org/terms
- Privacy Policy: https://valoia.duckdns.org/privacy
- Verification file: https://valoia.duckdns.org/riot.txt
- Screenshots / short screen recording: [TODO: see runbook]
