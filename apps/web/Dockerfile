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
# Public URL of the gateway, WITHOUT a trailing path (for example https://gateway-xyz.a.run.app).
ENV GATEWAY_URL=http://gateway:8080
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
