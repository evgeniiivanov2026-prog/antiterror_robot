FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
COPY package.json pnpm-lock.yaml ./
COPY src/database/schema.prisma src/database/schema.prisma
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm prisma generate && pnpm build
ENV NODE_ENV=production
CMD ["sh", "docker-entrypoint.sh"]
