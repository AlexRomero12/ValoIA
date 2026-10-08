#!/usr/bin/env bash
#
# Verificación post-despliegue del dashboard personal (ValoIA).
#
# Comprueba, contra la instancia que está corriendo, que las mejoras de la API
# v4.10 responden con datos reales: récords (accolades), maestría de agentes,
# Premier, rango enriquecido (MMR v3), desglose del RR y la auditoría del motor
# de aperturas contra el first blood oficial de Riot.
#
# Pensado para el VPS: resuelve el dominio a loopback (--resolve) para no
# depender del DNS/hairpin, y saca las credenciales del .env del despliegue.
#
#   bash scripts/verify-deploy.sh [perfil]
#
#   perfil: id del perfil del dashboard (por defecto `alex`).
#   ENV_FILE=...   fuerza la ruta del .env (si no, busca en ., /opt/valoia y ..).
#
set -u

PROFILE="${1:-alex}"

ENV_FILE="${ENV_FILE:-}"
if [ -z "$ENV_FILE" ]; then
  for c in .env /opt/valoia/.env ../.env; do
    if [ -f "$c" ]; then ENV_FILE="$c"; break; fi
  done
fi
if [ -z "$ENV_FILE" ]; then
  echo "No encuentro el .env del despliegue. Pásalo con ENV_FILE=/ruta/.env"
  exit 1
fi

getenv() { grep -m1 "^$1=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '\r' | sed 's/^"//; s/"$//'; }
U=$(getenv AUTH_USER)
P=$(getenv AUTH_PASSWORD)
DOMAIN=$(getenv PERSONAL_DOMAIN); [ -z "$DOMAIN" ] && DOMAIN=valoia-personal.duckdns.org
BASE="https://$DOMAIN"
CURL="curl -s --resolve $DOMAIN:443:127.0.0.1"
COOKIES=$(mktemp)

echo "== contenedores =="
docker ps --filter name=valo-dash --format '  {{.Names}} | {{.Status}} | {{.Image}}' || true

echo
echo "== commit desplegado =="
# Ojo: en un worktree `.git` es un archivo, no un directorio (-e, no -d).
FOUND=0
for d in /opt/valoia-main . ..; do
  if [ -e "$d/.git" ]; then
    echo "  $(git -C "$d" log --oneline -1 2>&1)"
    FOUND=1
    break
  fi
done
[ "$FOUND" = "0" ] && echo "  (no encuentro un checkout de git cerca)"

echo
echo "== archivos de build con las rutas nuevas =="
docker exec valo-dash sh -c "ls /app/.next/server/app/api/valorant/ 2>/dev/null | grep -E 'records|mastery|premier' | tr '\n' ' '"; echo

if [ -z "$U" ] || [ -z "$P" ]; then
  echo
  echo "Falta AUTH_USER/AUTH_PASSWORD en $ENV_FILE: no puedo hacer login para probar la API."
  exit 1
fi

echo
echo "== login =="
BODY=$(python3 -c "import json,sys; print(json.dumps({'username': sys.argv[1], 'password': sys.argv[2]}))" "$U" "$P" 2>/dev/null) \
  || BODY="{\"username\":\"$U\",\"password\":\"$P\"}"
CODE=$($CURL -o /tmp/verify-login.json -w '%{http_code}' -c "$COOKIES" \
  -X POST -H 'Content-Type: application/json' --data "$BODY" "$BASE/api/auth/login")
if [ "$CODE" != "200" ]; then
  echo "  login HTTP $CODE · $(head -c 160 /tmp/verify-login.json)"
  echo "  (si cambiaste la contraseña del usuario, exporta AUTH_USER/AUTH_PASSWORD actuales)"
  exit 1
fi
echo "  OK como $(python3 -c "import json;print(json.load(open('/tmp/verify-login.json'))['user']['username'])")"

get_json() { $CURL -b "$COOKIES" "$BASE$1" "${@:2}"; }

echo
echo "== récords (GET /api/valorant/records) =="
get_json "/api/valorant/records?player=$PROFILE" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if d.get('error'): print('  error:', d['error']); raise SystemExit
top=(d.get('allTime') or [{}])[0]
print('  %d récords · mejor: %s -> %s' % (len(d.get('allTime') or []), top.get('label'), top.get('bestText')))
print('  del acto: %d · partidas con récord: %d' % (len(d.get('actRecords') or []), len(d.get('recent') or [])))
"

echo
echo "== maestría (GET /api/valorant/mastery) =="
get_json "/api/valorant/mastery?player=$PROFILE" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if d.get('error'): print('  error:', d['error']); raise SystemExit
ag=d.get('agents') or []
print('  %d agentes · nivel total %s · al máximo: %s' % (len(ag), d.get('totalLevel'), d.get('maxed')))
print('  top: ' + ', '.join('%s %s' % (a['agent'], a['level']) for a in ag[:4]))
"

echo
echo "== Premier (GET /api/valorant/premier) =="
get_json "/api/valorant/premier?player=$PROFILE" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if d.get('error'): print('  error:', d['error']); raise SystemExit
print('  %s#%s · %d miembros · temporada: %s' % (d.get('name'), d.get('tag'), len(d.get('members') or []),
      'inscrito' if (d.get('current') or {}).get('enrolled') else 'sin inscribir'))
print('  roster: ' + ', '.join((m.get('name') or m['puuid'][:8]) + ' (' + m['role'] + ')' for m in (d.get('members') or [])[:5]))
"

echo
echo "== resumen: rango, RR y auditoría de aperturas =="
get_json "/api/valorant/summary?season=current&limit=40&player=$PROFILE" -o /tmp/verify-summary.json
python3 -c "
import json
d=json.load(open('/tmp/verify-summary.json'))
if d.get('error'): print('  error:', d['error']); raise SystemExit
r=d.get('rank') or {}
prot=r.get('protection') or {}
print('  rango: %s · %s RR · pico %s (%s) · escudos %s/%s' % ((r.get('tier') or {}).get('name'), r.get('rr'),
      (r.get('peak') or {}).get('tier'), (r.get('peak') or {}).get('season'), prot.get('shields'), prot.get('status')))
if r.get('prestige'): print('  prestigio: ' + ', '.join('%s x%s' % (p['tier'], p['count']) for p in r['prestige']))
m=(d.get('matches') or [{}])[0].get('rrDetail') or {}
if m: print('  último RR: %s -> %s (%+d)' % (m.get('rrBefore'), m.get('rrAfter'), m.get('delta') or 0))
v=(d.get('aperturas') or {}).get('verificacion') or {}
print('  aperturas: %s rondas oficiales · %s coincidencias · %s discrepancias · bando oficial %s'
      % (v.get('official'), v.get('agree'), v.get('mismatch'), v.get('sideOfficial')))
print('  partidas en la ventana: %d · rondas sin bando: %s' % (len(d.get('matches') or []), (d.get('aperturas') or {}).get('sinLado')))
"

rm -f "$COOKIES"
echo
echo "Listo. Si algún bloque dice «error», revisa: docker logs valo-dash --tail 50"
