# Runbook · Publicar el demo y solicitar la production key

Pasos para pasar del local (4323) al sitio público que Riot revisará.
Ejecutar solo cuando se decida el **go**.

> Costos y rentabilidad (dominio, correo, VPS, ads y premium, en COP):
> ver [`costos.md`](./costos.md).

## 1. Requisitos previos

### Etapa 1 — solicitud (COP 0, sin compras)

- **Dominio para Riot:** **`valoia.duckdns.org`** (ya existe y funciona).
  Hoy sirve el dashboard personal, así que este **se mueve** a un segundo
  hostname DuckDNS gratis (`valoia-personal.duckdns.org`; mismo token, misma
  IP). Ambos conviven en tu Oracle.
- **Correo:** `brayan12r@gmail.com` ya está en `CONTACT_EMAIL` y en la
  solicitud (queda público en `/terms` y `/privacy`).
- **VPS:** Oracle Always Free actual; se despliega con
  `docker-compose.vps.yml` + `Caddyfile.vps` (público en el dominio raíz,
  personal en el nuevo hostname, OpenClaw intacto).

Pasos:

1. **Crear `valoia-personal.duckdns.org`** en tu cuenta DuckDNS (mismo token)
   y verificar con `dig +short valoia-personal.duckdns.org`.
2. **`.env` del VPS:** añadir `PUBLIC_AUTH_SECRET=<32+ bytes>` (distinto del
   `AUTH_SECRET` personal) y, si aplica, `PUBLIC_DOMAIN`/`PERSONAL_DOMAIN`.
3. **Desplegar:** `docker compose -f docker-compose.vps.yml up -d --build`.
   Reutiliza los volúmenes del compose de producción (no se pierden datos).
4. **Verificar:** `https://valoia.duckdns.org` (landing pública) y
   `https://valoia-personal.duckdns.org` (dashboard personal), ambas con HTTPS.
5. **`riot.txt` real** cuando Riot lo entregue y capturas del flujo (sección 4).

### Etapa 2 — producción tras la aprobación (opcional, recomendada)

Comprar dominio propio + VPS dedicado para credibilidad y separación del
dashboard personal: `valoia.app` en **Porkbun** + **Hetzner CX23** (costos
detallados en [`costos.md`](./costos.md)). La migración es: DNS al nuevo
dominio, `DOMAIN`, `CONTACT_EMAIL` si cambia, y desplegar el mismo compose.

### Despliegue

- `docker-compose.vps.yml` en el VPS (o `docker-compose.public.yml` en local) + variables en `.env`:
  - `APP_MODE=public`
  - `AUTH_SECRET=<32+ bytes base64url>` (obligatorio; sin él no se firman sesiones)
  - `AUTH_USER` / `AUTH_PASSWORD` (opcional: siembra el admin de moderación)
  - En el VPS el público usa `PUBLIC_AUTH_SECRET` (distinto al `AUTH_SECRET` personal).
  - `MOCK_RIOT_IDS=AlexRomero12#LAN` (identidad que permite el modo demo)
  - `RSO_ENABLED=0` hasta recibir credenciales RSO de Riot.
- `TRUST_PROXY=1` detrás de Caddy.
- **Contacto legal**: ya definido en `CONTACT_EMAIL` (`brayan12r@gmail.com`);
  quedará público en `/privacy` y `/terms`. El titular (ValoIA, proyecto
  independiente), el domicilio (Bogotá, Colombia) y la ley aplicable también
  están definidos. Los textos siguen la estructura de OP.GG/Blitz/Tracker
  Network (bases jurídicas GDPR, retención, cookies necesarias, derechos, edad
  mínima, uso aceptable y responsabilidad), pero deben revisarse con un
  profesional antes de publicar.

## 2. Contenido obligatorio en el sitio

- [ ] Landing con descripción del producto y disclaimers (ya implementado).
- [ ] `/terms` y `/privacy` visibles y enlazados desde el footer (ya implementado).
- [x] `public/riot.txt` con el token de verificación de Riot
      (`d56eddd3-6f2b-4f4b-88b4-20aa9f77f478`), accesible en
      `https://valoia.duckdns.org/riot.txt`. Verificado.

## 3. Desplegar el demo público

En local (revisión, sin dominio): `docker-compose.public.yml` en el puerto 4323.

En el **VPS Hetzner** el despliegue real necesita Caddy para HTTPS con el
dominio: usar el patrón de `docker-compose.prod.yml` (Caddy + app) añadiendo el
servicio público (`docker-compose.public.yml`) a esa misma red, o crear un
`docker-compose.public.prod.yml` con ambos servicios.

```bash
# En local, para revisar el modo público
docker compose -f docker-compose.public.yml up -d --build
docker compose -f docker-compose.public.yml logs -f
```

Verificaciones:
- `https://<subdominio>.duckdns.org/` → landing.
- `https://<subdominio>.duckdns.org/login` → registro funciona.
- Registro → Mi cuenta → "Conectar con Riot" (demo) → activar perfil público.
- `/valorant` muestra los datos demo con la etiqueta correspondiente.
- `https://<subdominio>.duckdns.org/riot.txt` sirve el token.

> El demo no depende de la dev key: si la key falta o expiró, la identidad cae
> al fixture (modo demo) para que el sitio no se rompa durante la revisión.

## 4. Capturas / video para la solicitud

Capturar (ES y EN si es posible):
1. Landing + ToS/Privacidad.
2. Registro e inicio de sesión.
3. Mi cuenta: vincular Riot (demo), consentimiento y toggle de perfil público.
4. Dashboard Ranked (KPIs, agentes, mapas) con el banner de datos demo.
5. Detalle de partida (timeline, kill feed) y Reglas de sesión.
6. Equipo/Comparar mostrando un perfil público opt-in y cómo desaparece al
   revocar el consentimiento.

## 5. Registrar el producto en Riot

1. Entrar a https://developer.riotgames.com con la cuenta Riot titular.
2. **Register Product** → VALORANT → pegar la descripción de
   `docs/riot/aplicacion.md` (EN).
3. Indicar la URL pública, ToS, Privacidad y adjuntar capturas/video.
4. Colocar el `riot.txt` que Riot indique y esperar la verificación.
5. Seguimiento en el hilo de mensajes del portal (DevRel).

## 6. Plazos reales y qué hacer mientras se revisa

- **Espera real (2026):** la FAQ de Riot dice “semanas”, pero DevRel confirma en
  su tracker público **~8 meses** (“3–8 meses”; un solo revisor para la cola).
  Editar la solicitud con frecuencia puede reiniciar la posición en la cola.
- **¿Hay que seguir pagando?** El sitio debe estar **online durante toda la
  revisión** (revisan cuando les toca, meses después). Costo de espera con este
  plan: ~COP 25.800/mes (Hetzner + dominio). Alternativa de menor costo:
  mantenerlo en Oracle Free y pagar solo el dominio (~COP 47.000/año),
  asumiendo el riesgo de que Oracle reclame recursos ociosos.
- **¿Rechazan?** Sí. Caso real reciente: rechazo a los ~3 meses por “el link no
  funciona o lleva a una página en blanco”. Riot comunica la decisión por
  mensajes del portal; el **motivo** se solicita por ticket de DevRel y puede
  tardar meses más. No hay garantía de una explicación detallada.
- **Mientras esperas:** no edites la solicitud si está en cola; mantén la web,
  ToS/Privacy y `riot.txt` accesibles; no lances el producto al público con dev
  key (solo demo para revisión); prepara monetización y promoción.

## 7. Después de la aprobación (M5)

1. Riot entrega `client_id`/`client_secret` de RSO → completar `.env`:
   `RSO_ENABLED=1`, `RSO_CLIENT_ID`, `RSO_CLIENT_SECRET`, `RSO_REDIRECT_URI`.
2. Poner la production key en `RIOT_API_KEY` y `RIOT_MATCH_SOURCE=live`.
3. Validar paridad mock↔live por `matchId` (mismos KPIs). Si algo difiere,
   ajustar `lib/riot/mapper.ts`.
4. Eliminar/etiquetar claramente los fixtures demo y regenerar si hiciera falta.
5. Revisar el límite de la key (headers `X-RateLimit`) y subir tráfico gradual.

## 8. Migrar dominio o VPS después de la aprobación

La production key **no está atada al dominio ni al servidor**: puedes mudar el
producto. Los dos únicos puntos que dependen del dominio son **RSO** (redirect
URI registrado) y la **verificación (`riot.txt`)**.

### Cambiar de dominio (p. ej. `valoia.duckdns.org` → `valoia.app`)

1. DNS del dominio nuevo (`A` → IP del VPS), bloque en `Caddyfile.vps`
   (`PUBLIC_DOMAIN`) y `DOMAIN` en `.env`; Caddy emite el certificado solo.
2. Servir `riot.txt` **también** en el dominio nuevo y mantener el viejo
   accesible durante la transición.
3. Pedir a Riot por mensaje del portal que **agregue/actualice el redirect URI
   del RSO client** al dominio nuevo. Si el RSO aún no está montado, lo ideal
   es migrar **antes** del kickoff y registrar el dominio final desde el inicio.
4. Actualizar el **Product URL** en el portal solo **después** de aprobado:
   editar la solicitud pendiente reinicia la posición en la cola.
5. Actualizar `docs/riot/aplicacion.md` y, si cambia el correo,
   `CONTACT_EMAIL` en `components/public/LegalDoc.tsx`.

### Cambiar de VPS

1. Crear la VM nueva (p. ej. Hetzner CX23), abrir 22/80/443 e instalar Docker.
2. En el VPS viejo: `bash scripts/backup.sh` (respalda `data`, `archive` y
   `public-data`).
3. Copiar el repo (clone + checkout de la rama) y el `.env` a la VM nueva, y
   restaurar el `tar.gz` en los volúmenes (ver `docs/despliegue.md`, sección 8).
4. `docker compose -f docker-compose.vps.yml up -d --build`; verificar HTTPS y
   login. Baja el TTL del DNS antes para propagar rápido.
5. Apagar el VPS viejo **solo** después de validar el nuevo (Caddy re-emite los
   certificados automáticamente).
