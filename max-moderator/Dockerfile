FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/russian-trusted-ca.crt

# The slim image on some hosts has no OpenSSL. deb.debian.org times out there;
# mirror.yandex.ru answers. npm registries do not, so Node libraries are
# unpacked from vendor/runtime.tar.gz instead of being downloaded.
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
  fi

COPY certs/russian-trusted-ca.pem /usr/local/share/ca-certificates/russian-trusted-ca.crt
RUN if command -v update-ca-certificates >/dev/null 2>&1; then update-ca-certificates; fi

WORKDIR /app

COPY vendor/runtime.tar.gz /tmp/runtime.tar.gz
RUN tar -xzf /tmp/runtime.tar.gz -C /app && rm /tmp/runtime.tar.gz

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

ENTRYPOINT ["./docker-entrypoint.sh"]
