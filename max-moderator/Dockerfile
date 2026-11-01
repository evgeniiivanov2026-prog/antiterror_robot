FROM node:22-bookworm-slim

# deb.debian.org (Fastly) times out from some servers, and an empty package
# list then makes apt claim that ca-certificates and openssl do not exist.
# The slim image already ships both libraries Prisma needs. Download Debian
# packages only when they are missing, and then from a mirror that answers.
RUN set -eu; \
  has_ssl=0; \
  for lib in /usr/lib/*/libssl.so.3 /lib/*/libssl.so.3; do \
    if [ -e "$lib" ]; then has_ssl=1; fi; \
  done; \
  if [ ! -s /etc/ssl/certs/ca-certificates.crt ] || [ "$has_ssl" -ne 1 ]; then \
    install_debian() { \
      mirror="$1"; \
      security="$2"; \
      printf 'deb %s bookworm main\ndeb %s bookworm-updates main\ndeb %s bookworm-security main\n' \
        "$mirror" "$mirror" "$security" > /etc/apt/sources.list; \
      rm -f /etc/apt/sources.list.d/debian.sources; \
      apt-get update \
        && apt-get install -y --no-install-recommends ca-certificates openssl \
        && rm -rf /var/lib/apt/lists/*; \
    }; \
    install_debian http://mirror.yandex.ru/debian http://mirror.yandex.ru/debian-security \
      || install_debian http://ftp.ru.debian.org/debian http://ftp.ru.debian.org/debian-security; \
  fi; \
  npm install -g pnpm@9.15.9 --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-timeout=120000 \
    || { \
      npm install -g pnpm@9.15.9 --registry https://registry.npmmirror.com --fetch-retries=5 --fetch-timeout=120000; \
      pnpm config set registry https://registry.npmmirror.com; \
    }

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY src/database/schema.prisma ./src/database/schema.prisma
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm exec prisma generate && pnpm build \
  && chmod +x docker-entrypoint.sh

ENV NODE_ENV=production
ENTRYPOINT ["./docker-entrypoint.sh"]
