FROM node:22-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @seguradora/gateway build
RUN pnpm --filter @seguradora/gateway deploy --legacy --prod /out

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
RUN printf '{"type":"module"}' > package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/gateway/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "dist/main.js"]
