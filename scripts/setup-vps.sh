#!/usr/bin/env bash
# Puesta en marcha de ValoIA en una VM Linux (Oracle Cloud u otra).
# Requisitos: código clonado + .env copiado desde tu PC con DOMAIN=tu-dominio.
# Uso: bash scripts/setup-vps.sh
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "ERROR: falta .env en $(pwd) — cópialo desde tu PC: scp .env usuario@IP:$(pwd)/.env" >&2
  exit 1
fi
if ! grep -qE '^DOMAIN=.+' .env; then
  echo "ERROR: añade DOMAIN=tu-dominio.com al .env" >&2
  exit 1
fi
if ! grep -qE '^AUTH_SECRET=.{16,}' .env; then
  echo "ERROR: falta AUTH_SECRET en el .env (genera uno y pégalo)" >&2
  exit 1
fi

echo "== Abriendo puertos 80/443 en el firewall del SO =="
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT 2>/dev/null || true
if command -v netfilter-persistent >/dev/null 2>&1; then
  sudo netfilter-persistent save
else
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent >/dev/null 2>&1 || true
  sudo netfilter-persistent save 2>/dev/null || true
fi
echo "   (recuerda abrir 80/443 también en la Security List de OCI)"

echo "== Instalando Docker (si hace falta) =="
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER" || true
  echo "   Docker instalado (si 'docker' pide sudo, cierra sesión y vuelve a entrar)"
fi

DOCKER="docker"
if ! docker info >/dev/null 2>&1; then DOCKER="sudo docker"; fi

echo "== Levantando ValoIA (build ARM incluida) =="
$DOCKER compose -f docker-compose.prod.yml up -d --build

sleep 5
$DOCKER compose -f docker-compose.prod.yml ps
echo
echo "Listo. Sigue el certificado con:"
echo "  $DOCKER compose -f docker-compose.prod.yml logs -f caddy"
echo "Y abre: https://$(grep -E '^DOMAIN=' .env | cut -d= -f2)"
