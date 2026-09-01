/*
 * riot-proxy.js — puente entre el contenedor Docker y la API local del Riot Client.
 *
 * El Riot Client solo acepta conexiones desde 127.0.0.1 (loopback) del propio PC,
 * y el contenedor Docker no puede alcanzar ese loopback. Este proxy corre EN EL
 * HOST (Windows), relee el lockfile en cada request (el puerto/password cambian
 * al reiniciar el Riot Client) y reenvía todo a la API local.
 *
 * Uso: node tools/riot-proxy.js   (puerto fijo 56080)
 * Para autostart en Windows: pon un acceso directo a este .bat en
 *   shell:startup  ->  "node C:\...\valo-dash-next\tools\riot-proxy.js"
 *
 * En docker-compose: STORE_LOCAL_HOST=host.docker.internal + RIOT_LOCAL_PORT=56080
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const LISTEN_PORT = 56080;

// El storefront requiere tokens de la sesión del JUEGO (el Riot Client solo
// da tokens sin permisos de pd, responde 404). El lockfile del juego existe
// mientras Valorant está abierto.
function lockfileCandidates() {
  const local = process.env.LOCALAPPDATA || '';
  const explicit = process.env.RIOT_GAME_LOCKFILE;
  return [
    explicit,
    path.join(local, 'Riot Games', 'Valorant', 'Config', 'lockfile'),
  ].filter(Boolean);
}

function lockfileInfo() {
  for (const file of lockfileCandidates()) {
    try {
      const raw = fs.readFileSync(file, 'utf8').trim();
      const parts = raw.split(':');
      const port = Number(parts[2]);
      if (!Number.isInteger(port) || port <= 0) continue;
      return { port, password: parts[3] };
    } catch {
      /* siguiente candidato */
    }
  }
  return null;
}

const server = http.createServer((req, res) => {
  const lock = lockfileInfo();
  if (!lock) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Riot Client cerrado (sin lockfile)' }));
  }
  const u = new URL(req.url, 'http://localhost');
  const upstream = https.request(
    {
      host: '127.0.0.1',
      port: lock.port,
      path: u.pathname + u.search,
      method: req.method,
      headers: {
        ...req.headers,
        host: `127.0.0.1:${lock.port}`,
        authorization: `Basic ${Buffer.from(`riot:${lock.password}`).toString('base64')}`,
      },
      rejectUnauthorized: false,
    },
    (upRes) => {
      res.writeHead(upRes.statusCode, upRes.headers);
      upRes.pipe(res);
    },
  );
  upstream.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No se pudo conectar con el Riot Client' }));
  });
  req.pipe(upstream);
});

server.listen(LISTEN_PORT, '0.0.0.0', () => {
  console.log(`[riot-proxy] escuchando en 0.0.0.0:${LISTEN_PORT} -> Riot Client (lockfile)`);
});