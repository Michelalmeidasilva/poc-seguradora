# Fake internal services (test double). Build from the repo root:
#   docker build -f infra/fake-services/Dockerfile .
# Only the fake and its entry are copied: it uses node:http alone, so there is no install step.
FROM node:22-slim
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app
RUN printf '{"type":"module"}' > package.json
COPY apps/chatbot/src/test/fake-services.ts apps/chatbot/src/test/fake-services.ts
COPY infra/fake-services/main.ts infra/fake-services/main.ts
USER node
EXPOSE 8080
CMD ["node", "--experimental-strip-types", "--disable-warning=ExperimentalWarning", "infra/fake-services/main.ts"]
