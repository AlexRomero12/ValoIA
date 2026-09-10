# Despliegue en Oracle Cloud (Always Free) con Docker + Caddy

Guía paso a paso para publicar ValoIA en una VM Ampere A1 (ARM) de Oracle,
con HTTPS automático y login propio. Todo el stack son dos contenedores:
`valo-dash` (Next.js) y `caddy` (reverse proxy + TLS).

> **Requisitos**: cuenta Oracle Cloud (Free Tier), un dominio (o subdominio
> DuckDNS gratis) y tu `.env` local a mano (tiene los secretos).

---

## 1. Crear la VM

Consola OCI → **Compute → Instances → Create instance**:

- **Image**: Ubuntu 24.04 (o 22.04)
- **Shape**: `VM.Standard.A1.Flex` → **2 OCPU / 12 GB** (el máximo Always Free; puedes pedir 1/6)
- **Boot volume**: 50 GB (mínimo 47)
- **Networking**: asignar **IPv4 pública** (VCN por defecto)
- **SSH keys**: sube tu clave pública (o deja que Oracle genere y descarga la privada)

Si sale **"Out of host capacity"**: reintenta (tu región tiene un solo AD) o sube
la cuenta a **Pay As You Go** (los recursos Always Free siguen gratis y
desaparece la recolección por inactividad).

Anota la **IP pública**.

## 2. Abrir puertos (dos capas)

**a) Security List / NSG** (OCI): ingress TCP 22 (tu IP), 80 y 443 desde `0.0.0.0/0`.

**b) Firewall del SO** (las imágenes Ubuntu de Oracle traen iptables cerrado):

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo apt-get install -y iptables-persistent
sudo netfilter-persistent save
```

## 3. DNS

Crea un registro **A** de tu dominio (o subdominio) apuntando a la IP pública.

- Dominio propio: en tu registrador/Cloudflare, `valoia.tudominio.com → IP`
- Gratis: [DuckDNS](https://www.duckdns.org) → `valoia.duckdns.org → IP`

Verifica: `dig +short valoia.tudominio.com` debe devolver la IP.

## 4. Instalar Docker

```bash
sudo apt-get update
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker   # o cierra sesión y vuelve a entrar
docker compose version
```

## 5. Subir el código y el .env

```bash
sudo mkdir -p /opt/valoia && sudo chown $USER /opt/valoia
git clone https://github.com/Player/ValoIA.git /opt/valoia
cd /opt/valoia/valo-dash-next
```

Si el repo es privado, usa un token (`https://<TOKEN>@github.com/...`) o sube
el código con `scp`.

**`.env`** (nunca está en git): cópialo desde tu PC — tiene las API keys, VAPID
y `AUTH_SECRET`/`AUTH_USER`/`AUTH_PASSWORD`.

```powershell
# Desde Windows (PowerShell), en la carpeta valo-dash-next:
scp .env ubuntu@IP:/opt/valoia/valo-dash-next/.env
```

Añade al `.env` del servidor una línea con tu dominio:

```env
DOMAIN=valoia.tudominio.com
```

Revisa que tenga al menos: `HENRIK_API_KEY`, `AUTH_SECRET`, `AUTH_USER`,
`AUTH_PASSWORD`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `STORE_SHARD`.

> La tienda es **RSO por usuario**: cada quien conecta su cookie `ssid` desde
> la página Tienda. No hace falta el Riot Client ni exponer nada de Riot.

## 6. Levantar

Atajo (hace los pasos 4–6: firewall, Docker y compose):

```bash
bash scripts/setup-vps.sh
```

O manualmente:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

La primera build tarda unos minutos (2 OCPU ARM). Caddy pedirá el certificado
solo; mira el log:

```bash
docker compose -f docker-compose.prod.yml logs -f caddy
```

Cuando veas `certificate obtained successfully`, entra a
`https://valoia.tudominio.com` y haz login con tu usuario admin.

## 7. Comprobaciones

```bash
curl -I https://valoia.tudominio.com          # 200/307 con HSTS
docker compose -f docker-compose.prod.yml ps  # ambos Up
docker exec valo-dash ls /app/data            # users.json, profiles.json, rso/...
```

- Sin sesión, `/` debe redirigir a `/login`.
- En **Perfiles → Solicitudes**, tus amigos pueden pedir acceso desde el login
  y tú apruebas (contraseña temporal con cambio forzado).
- En **Perfiles → Sesiones** puedes ver/cerrar dispositivos.

## 8. Backups

El volumen `valo-data` guarda usuarios, perfiles, RSO, favoritas, historial y
comentarios; `valo-archive` las partidas para siempre. Script incluido:

```bash
bash scripts/backup.sh          # crea backups/valoia-AAAA-MM-DD.tar.gz
```

Programa un cron diario:

```bash
crontab -e
# 0 4 * * * cd /opt/valoia/valo-dash-next && bash scripts/backup.sh >> /var/log/valoia-backup.log 2>&1
```

Restaurar (detén el stack, extrae sobre los volúmenes y vuelve a levantar):

```bash
docker compose -f docker-compose.prod.yml down
DATA_VOL=$(docker volume ls --format '{{.Name}}' | grep -E '_valo-data$' | head -1)
ARCH_VOL=$(docker volume ls --format '{{.Name}}' | grep -E '_valo-archive$' | head -1)
docker run --rm -v "$DATA_VOL":/data -v "$ARCH_VOL":/archive -v "$(pwd)/backups":/backup alpine \
  sh -c "rm -rf /data/* /archive/* && tar xzf /backup/valoia-AAAA-MM-DD.tar.gz -C /"
docker compose -f docker-compose.prod.yml up -d
```

## 9. Actualizar

```bash
cd /opt/valoia/valo-dash-next
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

## 10. Notas

- **Recolección por inactividad**: Oracle puede reclamar la VM si 7 días con
  CPU, red y RAM por debajo del 20%. ValoIA es ligero; si te preocupa, pasa la
  cuenta a **Pay As You Go** (exenta) o mantén backups.
- **Riot API key**: si usas el fallback de Riot, la key de desarrollo expira
  cada 24 h (Henrik es el proveedor recomendado y no caduca por key personal).
- **RSO**: los tokens se renuevan solos con la cookie `ssid`; si Riot la
  invalida, cada usuario reconecta desde su Tienda.
- **Tráfico**: 10 TB/mes incluidos en Always Free; este uso consume cientos de MB.
- El compose de desarrollo (`docker-compose.yml`) sigue disponible para local.
