#!/usr/bin/env bash
# Integration test of the web nginx in front of the gateway (needs Docker; not part of `pnpm test`).
#   bash infra/test-nginx.sh        (or: pnpm test:infra)
# (a) compose stack up + smoke;
# (b) the gateway is recreated with a DIFFERENT IP while `web` keeps running, then smoke again
#     (nginx must resolve the gateway at request time, not once at start);
# (c) rendered config of the web image for http/https GATEWAY_URL, IPv6 nameserver, bad input;
# (d) response headers of /, /assets/<file>, /health;
# (e) Host, Origin, X-Forwarded-Proto, path and query reach the upstream unchanged (throwaway
#     echo server on the compose network, removed at the end).
# (0) first, the EXIT trap itself: a child run that fails right after `compose up` must leave no
#     container, network or volume of the compose project behind.
# Everything started here is removed by the EXIT trap. Written for bash 3.2 (macOS /bin/bash):
# no mapfile, associative arrays, ${var,,} or [[ -v ]], and no bare "${arr[@]}" of a possibly
# empty array under `set -u` (bash 3.2 treats it as unbound).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE=(docker compose -f "$ROOT/infra/docker-compose.yml")
PROJECT=seguradora
NETWORK="${PROJECT}_default"
WEB_IMAGE="${PROJECT}-web"
WEB_PORT="${WEB_PORT:-8080}"
ECHO_PORT="${ECHO_WEB_PORT:-18081}"
BASE_URL="http://localhost:${WEB_PORT}"
TMP="$(mktemp -d)"
# Throwaway containers (fixed names so the trap can always remove them).
SQUATTERS=()
ECHO_NAME="${PROJECT}-test-echo"
ECHO_WEB_NAME="${PROJECT}-test-echo-web"

cleanup() {
  local status=$?
  docker rm -f "$ECHO_NAME" "$ECHO_WEB_NAME" ${SQUATTERS[@]+"${SQUATTERS[@]}"} >/dev/null 2>&1 || true
  "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$TMP"
  if [ "$status" -eq 0 ]; then echo "PASS test-nginx"; else echo "FAIL test-nginx (exit $status)"; fi
}
trap cleanup EXIT

# KEEP_GOING=1 reports every failure instead of stopping at the first (used for the RED run).
FAILURES=0
fail() {
  echo "FAIL $*" >&2
  if [ "${KEEP_GOING:-}" = 1 ]; then
    FAILURES=$((FAILURES + 1))
    return 0
  fi
  exit 1
}
ok() { echo "ok $*"; }

container_ip() {
  docker inspect -f "{{(index .NetworkSettings.Networks \"$NETWORK\").IPAddress}}" "$1"
}

project_leftovers() { # prints containers, networks and volumes of the compose project, if any
  local label="label=com.docker.compose.project=$PROJECT"
  docker ps -aq --filter "$label"
  docker network ls -q --filter "$label"
  docker volume ls -q --filter "$label"
}

# --- (0) the cleanup trap works even when the run fails early ---------------------------------
if [ -z "${TEST_NGINX_FAIL_EARLY:-}" ]; then
  echo "== (0) cleanup trap on an early failure"
  # Child run under the system bash (3.2 on macOS) that fails right after `compose up`.
  if TEST_NGINX_FAIL_EARLY=1 /bin/bash "${BASH_SOURCE[0]}" >"$TMP/early.log" 2>&1; then
    cat "$TMP/early.log" >&2
    fail "the early-failure child run should have failed"
  fi
  grep -q 'FAIL test-nginx' "$TMP/early.log" || {
    cat "$TMP/early.log" >&2
    fail "the cleanup trap did not finish in the early-failure run"
  }
  leftovers="$(project_leftovers)"
  [ -z "$leftovers" ] || fail "early failure left compose resources behind: $(echo $leftovers)"
  ok "early failure: trap ran, no container/network/volume of project $PROJECT left"
fi

# --- (a) stack + smoke -------------------------------------------------------------------------
echo "== (a) compose up + smoke"
"${COMPOSE[@]}" up -d --build --wait
[ -z "${TEST_NGINX_FAIL_EARLY:-}" ] || fail "TEST_NGINX_FAIL_EARLY set: failing on purpose after compose up"
node "$ROOT/infra/smoke.mjs" "$BASE_URL"
ok "smoke before the gateway IP change"

# --- (b) gateway gets a new IP while web keeps running -----------------------------------------
echo "== (b) gateway IP change without restarting web"
web_id="$("${COMPOSE[@]}" ps -q web)"
web_started="$(docker inspect -f '{{.State.StartedAt}}' "$web_id")"
old_ip="$(container_ip "$("${COMPOSE[@]}" ps -q gateway)")"
echo "gateway old IP: $old_ip"

# Docker may hand a freed address straight back to the next container. To make the change
# certain, remove the gateway and park throwaway containers on the network until one of them
# holds the old address; the recreated gateway then cannot get it.
"${COMPOSE[@]}" rm -sf gateway >/dev/null
for i in $(seq 1 20); do
  name="${PROJECT}-test-ipsquat-$i"
  SQUATTERS+=("$name")
  docker run -d --name "$name" --network "$NETWORK" --entrypoint sleep "$WEB_IMAGE" 600 >/dev/null
  if [ "$(container_ip "$name")" = "$old_ip" ]; then
    echo "old IP $old_ip now held by $name"
    break
  fi
done
"${COMPOSE[@]}" up -d --force-recreate --no-deps --wait gateway
new_ip="$(container_ip "$("${COMPOSE[@]}" ps -q gateway)")"
echo "gateway new IP: $new_ip"
[ "$new_ip" != "$old_ip" ] || fail "gateway kept the same IP ($old_ip); the test proves nothing"

[ "$("${COMPOSE[@]}" ps -q web)" = "$web_id" ] || fail "web container was recreated"
[ "$(docker inspect -f '{{.State.StartedAt}}' "$web_id")" = "$web_started" ] || fail "web restarted"
ok "web container untouched ($web_id started $web_started)"

# nginx caches DNS answers for valid=10s; the recreated gateway is healthy only after a few
# seconds, but wait out the TTL anyway so the result does not depend on timing.
sleep 11
node "$ROOT/infra/smoke.mjs" "$BASE_URL" || fail "smoke after the gateway IP change (web kept the stale IP?)"
ok "smoke after the gateway IP change"

# --- (c) rendered config -----------------------------------------------------------------------
echo "== (c) rendered config"
# render <out-file> [docker run args...] : runs the image entrypoint (all /docker-entrypoint.d
# scripts, including envsubst) and `nginx -t`, then prints the rendered server config.
render() {
  local out="$1"
  shift
  docker run --rm "$@" --entrypoint sh "$WEB_IMAGE" -c \
    '/docker-entrypoint.sh nginx -t >/dev/null 2>/tmp/t || { cat /tmp/t >&2; exit 1; }; cat /tmp/t; echo ---; cat /etc/nginx/conf.d/default.conf' \
    >"$out" 2>&1
}
expect_line() { # expect_line <file> <fixed string> <what>
  grep -qF -- "$2" "$1" || {
    cat "$1" >&2
    fail "rendered config ($3): missing '$2'"
  }
}

render "$TMP/http.conf" -e GATEWAY_URL=http://gateway:8080 || fail "nginx -t (http GATEWAY_URL)"
expect_line "$TMP/http.conf" "test is successful" "http nginx -t"
expect_line "$TMP/http.conf" 'set $gateway_upstream "http://gateway:8080";' "http upstream"
expect_line "$TMP/http.conf" 'proxy_pass $gateway_upstream$request_uri;' "http proxy_pass"
expect_line "$TMP/http.conf" 'proxy_set_header Host "gateway:8080";' "http Host"
expect_line "$TMP/http.conf" 'proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;' "XFF"
expect_line "$TMP/http.conf" 'proxy_set_header X-Forwarded-Proto $web_forwarded_proto;' "XFP"
expect_line "$TMP/http.conf" 'map $http_x_forwarded_proto $web_forwarded_proto {' "XFP map"
expect_line "$TMP/http.conf" 'try_files $uri /index.html;' "SPA fallback"
grep -qiE 'proxy_set_header +Origin' "$TMP/http.conf" && fail "the config must not touch the Origin header"
grep -qE '\$\{[A-Z_]+\}' "$TMP/http.conf" && fail "unrendered placeholder left in the http config"
ok "http GATEWAY_URL renders and passes nginx -t"

printf 'search example.internal\nnameserver 169.254.169.254\nnameserver 10.0.0.2\n' >"$TMP/resolv-v4"
render "$TMP/https.conf" -v "$TMP/resolv-v4:/etc/resolv.conf:ro" \
  -e GATEWAY_URL=https://gateway-x.a.run.app/ || fail "nginx -t (https GATEWAY_URL)"
expect_line "$TMP/https.conf" "test is successful" "https nginx -t"
expect_line "$TMP/https.conf" 'resolver 169.254.169.254 valid=10s ipv6=off;' "first nameserver"
expect_line "$TMP/https.conf" 'set $gateway_upstream "https://gateway-x.a.run.app";' "trailing slash stripped"
expect_line "$TMP/https.conf" 'proxy_set_header Host "gateway-x.a.run.app";' "https Host (default port omitted)"
expect_line "$TMP/https.conf" 'proxy_ssl_server_name on;' "SNI on"
expect_line "$TMP/https.conf" 'proxy_ssl_name "gateway-x.a.run.app";' "SNI name"
ok "https GATEWAY_URL (trailing slash) renders and passes nginx -t"

render "$TMP/port.conf" -e GATEWAY_URL=https://gw.example.test:8443 || fail "nginx -t (https with port)"
expect_line "$TMP/port.conf" 'proxy_set_header Host "gw.example.test:8443";' "non-default port kept in Host"
expect_line "$TMP/port.conf" 'proxy_ssl_name "gw.example.test";' "SNI without port"
render "$TMP/p443.conf" -e GATEWAY_URL=https://gw.example.test:443 || fail "nginx -t (https :443)"
expect_line "$TMP/p443.conf" 'proxy_set_header Host "gw.example.test";' "default https port dropped"
ok "explicit ports: non-default kept, default dropped"

printf 'nameserver fd00::53\nnameserver 10.0.0.2\n' >"$TMP/resolv-v6"
render "$TMP/v6.conf" -v "$TMP/resolv-v6:/etc/resolv.conf:ro" -e GATEWAY_URL=http://gateway:8080 ||
  fail "nginx -t (IPv6 nameserver)"
expect_line "$TMP/v6.conf" 'resolver [fd00::53] valid=10s ipv6=off;' "IPv6 nameserver bracketed"
ok "IPv6 nameserver is bracketed"

expect_start_failure() { # expect_start_failure <what> <message fragment> [docker run args...]
  local what="$1" msg="$2"
  shift 2
  if render "$TMP/bad.conf" "$@"; then
    cat "$TMP/bad.conf" >&2
    fail "container start should fail: $what"
  fi
  grep -qF -- "$msg" "$TMP/bad.conf" || {
    cat "$TMP/bad.conf" >&2
    fail "unclear start failure for $what"
  }
  ok "start fails clearly: $what"
}
printf 'search example.internal\n' >"$TMP/resolv-none"
expect_start_failure "no nameserver" "no nameserver in /etc/resolv.conf" \
  -v "$TMP/resolv-none:/etc/resolv.conf:ro" -e GATEWAY_URL=http://gateway:8080
expect_start_failure "GATEWAY_URL with a path" "GATEWAY_URL must be http(s)://host[:port]" \
  -e GATEWAY_URL=http://gateway:8080/v1
expect_start_failure "GATEWAY_URL without scheme" "GATEWAY_URL must be http(s)://host[:port]" \
  -e GATEWAY_URL=gateway:8080
expect_start_failure "GATEWAY_URL with a query" "GATEWAY_URL must be http(s)://host[:port]" \
  -e 'GATEWAY_URL=http://gateway:8080?x=1'
expect_start_failure "empty GATEWAY_URL" "GATEWAY_URL must be http(s)://host[:port]" -e GATEWAY_URL=

# --- (d) response headers ----------------------------------------------------------------------
echo "== (d) response headers"
CSP_PREFIX="default-src 'self';"
headers() { curl -sS -o /dev/null -D - "$BASE_URL$1" | tr -d '\r'; }
expect_header() { # expect_header <path> <header line prefix, case-insensitive>
  grep -qi -- "^$2" "$TMP/h" || {
    cat "$TMP/h" >&2
    fail "$1: missing header '$2'"
  }
}
security_headers() {
  expect_header "$1" 'X-Content-Type-Options: nosniff'
  expect_header "$1" 'Referrer-Policy: no-referrer'
  expect_header "$1" "Content-Security-Policy: $CSP_PREFIX"
}

headers / >"$TMP/h"
expect_header / 'HTTP/1.1 200'
security_headers /
expect_header / 'Cache-Control: no-cache'
ok "/ headers"

headers /some/spa/route >"$TMP/h"
expect_header /some/spa/route 'HTTP/1.1 200'
expect_header /some/spa/route 'Content-Type: text/html'
ok "SPA fallback serves index.html"

asset="$("${COMPOSE[@]}" exec -T web sh -c 'ls /usr/share/nginx/html/assets | head -n 1')"
[ -n "$asset" ] || fail "no file in /usr/share/nginx/html/assets"
headers "/assets/$asset" >"$TMP/h"
expect_header "/assets/$asset" 'HTTP/1.1 200'
security_headers "/assets/$asset"
expect_header "/assets/$asset" 'Cache-Control: public, max-age=31536000, immutable'
headers /assets/does-not-exist.js >"$TMP/h"
expect_header /assets/does-not-exist.js 'HTTP/1.1 404'
ok "/assets/$asset headers (missing asset is 404, not index.html)"

headers /health >"$TMP/h"
expect_header /health 'HTTP/1.1 200'
security_headers /health
expect_header /health 'Cache-Control: no-store'
[ "$(curl -sS "$BASE_URL/health")" = "ok" ] || fail "/health body is not 'ok'"
# Logs go to a file first: `logs | grep -q` under pipefail can fail by SIGPIPE and hide a match.
access_logged() { # access_logged <path>: true when the web access log has a GET of exactly <path>
  "${COMPOSE[@]}" logs web >"$TMP/web.log" 2>&1
  grep -qF "\"GET $1 HTTP/" "$TMP/web.log"
}
curl -fsS -o /dev/null "$BASE_URL/"
access_logged / || fail "positive control: GET / should be in the access log (check is blind)"
if access_logged /health; then fail "/health is access-logged"; fi
ok "/health: 200 ok, security headers, no-store, not logged (positive control: / is logged)"

"${COMPOSE[@]}" exec -T web grep -qF 'resolver 127.0.0.11 valid=10s ipv6=off;' /etc/nginx/conf.d/default.conf ||
  fail "compose web: resolver is not Docker's embedded DNS"
ok "compose web resolves through Docker's embedded DNS (127.0.0.11)"

# --- (e) Host / Origin / path / query reach the upstream ---------------------------------------
echo "== (e) headers and URI forwarded to the upstream"
# Throwaway echo server (Node from the gateway image) under its own alias on the compose
# network, on a non-default port so the Host header must carry it.
docker run -d --name "$ECHO_NAME" --network "$NETWORK" --network-alias echo-gw \
  --entrypoint node "${PROJECT}-gateway" -e "
    require('node:http').createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ method: req.method, url: req.url, headers: req.headers, body }));
      });
    }).listen(9000, '0.0.0.0');" >/dev/null
docker run -d --name "$ECHO_WEB_NAME" --network "$NETWORK" -p "127.0.0.1:${ECHO_PORT}:8080" \
  -e GATEWAY_URL=http://echo-gw:9000 "$WEB_IMAGE" >/dev/null
for _ in $(seq 1 30); do
  curl -fsS "http://127.0.0.1:${ECHO_PORT}/health" >/dev/null 2>&1 && break
  sleep 1
done

check_echo() { # check_echo <json file> <node expression over `e`> <what>
  node -e "const e = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
    if (!($2)) { console.error(JSON.stringify(e, null, 2)); process.exit(1); }" "$1" ||
    fail "echo: $3"
}

curl -fsS "http://127.0.0.1:${ECHO_PORT}/v1/events?x=1&y=2" \
  -H 'Origin: http://localhost:8080' -X POST -H 'content-type: application/json' \
  --data '{"type":"user.text"}' >"$TMP/e1.json" || fail "request through web to the echo upstream"
check_echo "$TMP/e1.json" "e.headers.host === 'echo-gw:9000'" "Host is the upstream host:port"
check_echo "$TMP/e1.json" "e.headers.origin === 'http://localhost:8080'" "Origin forwarded unchanged"
check_echo "$TMP/e1.json" "e.url === '/v1/events?x=1&y=2'" "path and query forwarded unchanged"
check_echo "$TMP/e1.json" "e.method === 'POST' && e.body === '{\"type\":\"user.text\"}'" "POST body"
check_echo "$TMP/e1.json" "e.headers['x-forwarded-proto'] === 'http'" "X-Forwarded-Proto falls back to \$scheme"
check_echo "$TMP/e1.json" "typeof e.headers['x-forwarded-for'] === 'string' && e.headers['x-forwarded-for'].length > 0" "X-Forwarded-For set"
ok "Host echo-gw:9000, Origin, POST body, /v1/events?x=1&y=2 reach the upstream"

curl -fsS "http://127.0.0.1:${ECHO_PORT}/v1/a%2Fb/stream?q=%20z&q=2" -H 'X-Forwarded-Proto: https' \
  -H 'X-Forwarded-For: 203.0.113.7' >"$TMP/e2.json" || fail "second echo request"
check_echo "$TMP/e2.json" "e.url === '/v1/a%2Fb/stream?q=%20z&q=2'" "encoded path and repeated query unchanged"
check_echo "$TMP/e2.json" "e.headers['x-forwarded-proto'] === 'https'" "incoming X-Forwarded-Proto kept"
check_echo "$TMP/e2.json" "e.headers['x-forwarded-for'].startsWith('203.0.113.7, ')" "X-Forwarded-For appended"
check_echo "$TMP/e2.json" "e.headers.origin === undefined" "no Origin invented"
ok "encoded path, X-Forwarded-Proto from the client hop, X-Forwarded-For appended"

[ "$FAILURES" -eq 0 ] || exit 1
