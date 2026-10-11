# syntax=docker/dockerfile:1
FROM node:22-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @seguradora/web build

FROM nginx:1.27-alpine
ENV PORT=8080
# Public URL of the gateway: http(s)://host[:port], no path (for example
# https://gateway-xyz.a.run.app). A trailing slash is dropped; anything else fails the start.
ENV GATEWAY_URL=http://gateway:8080
# The template is rendered with only these variables, so nginx's own $variables are never touched.
ENV NGINX_ENVSUBST_FILTER='^(PORT|GATEWAY_URL|GATEWAY_HOST|GATEWAY_HOSTNAME|NAMESERVER)$'
# The image entrypoint SOURCES /docker-entrypoint.d/*.envsh (and only executes *.sh), in order,
# so these exports reach 20-envsubst-on-templates.sh. `exit 1` here stops the container start.
COPY --chmod=0755 <<'EOF' /docker-entrypoint.d/15-resolver.envsh
#!/bin/sh
# Derives NAMESERVER (nginx `resolver`) from /etc/resolv.conf and GATEWAY_HOST / GATEWAY_HOSTNAME
# (Host header / SNI) from GATEWAY_URL. Sourced by /docker-entrypoint.sh: names are prefixed.
web_resolver_fail() {
  echo "15-resolver.envsh: ERROR: $*" >&2
  exit 1
}

web_resolver_url="${GATEWAY_URL:-}"
web_resolver_url="${web_resolver_url%/}"
case "$web_resolver_url" in
  http://*) web_resolver_default_port=80 ;;
  https://*) web_resolver_default_port=443 ;;
  *) web_resolver_default_port= ;;
esac
web_resolver_authority="${web_resolver_url#*://}"
if [ -z "$web_resolver_default_port" ] ||
  ! printf '%s\n' "$web_resolver_authority" |
  grep -Eq '^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*(:[0-9]{1,5})?$'; then
  web_resolver_fail "GATEWAY_URL must be http(s)://host[:port] with no path, query or credentials (got '${GATEWAY_URL:-}')"
fi
case "$web_resolver_authority" in
  *:*)
    web_resolver_hostname="${web_resolver_authority%:*}"
    web_resolver_port="${web_resolver_authority##*:}"
    ;;
  *)
    web_resolver_hostname="$web_resolver_authority"
    web_resolver_port=
    ;;
esac
if [ -n "$web_resolver_port" ] && { [ "$web_resolver_port" -lt 1 ] || [ "$web_resolver_port" -gt 65535 ]; }; then
  web_resolver_fail "GATEWAY_URL must be http(s)://host[:port] with a port in 1-65535 (got '${GATEWAY_URL:-}')"
fi
if [ -z "$web_resolver_port" ] || [ "$web_resolver_port" -eq "$web_resolver_default_port" ]; then
  GATEWAY_HOST="$web_resolver_hostname"
else
  GATEWAY_HOST="$web_resolver_hostname:$web_resolver_port"
fi
GATEWAY_HOSTNAME="$web_resolver_hostname"
GATEWAY_URL="$web_resolver_url"

NAMESERVER="$(awk '$1 == "nameserver" { print $2; exit }' /etc/resolv.conf 2>/dev/null || true)"
if [ -z "$NAMESERVER" ]; then
  web_resolver_fail "no nameserver in /etc/resolv.conf: nginx cannot resolve the gateway at request time"
fi
case "$NAMESERVER" in
  *:*) NAMESERVER="[$NAMESERVER]" ;;
esac

export GATEWAY_URL GATEWAY_HOST GATEWAY_HOSTNAME NAMESERVER
echo "15-resolver.envsh: resolver $NAMESERVER, upstream $GATEWAY_URL, Host $GATEWAY_HOST"
unset web_resolver_url web_resolver_default_port web_resolver_authority web_resolver_hostname web_resolver_port
EOF
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
