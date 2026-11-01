FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY src/database/schema.prisma src/database/schema.prisma
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm exec prisma generate --schema src/database/schema.prisma && pnpm exec tsc -p tsconfig.json \
  && chmod +x docker-entrypoint.sh \
  && chown -R node:node /app

USER node

ENTRYPOINT ["./docker-entrypoint.sh"]
