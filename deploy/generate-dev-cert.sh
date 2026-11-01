#!/bin/sh
set -eu
mkdir -p deploy/certs
openssl req -x509 -newkey rsa:2048 \
  -keyout deploy/certs/privkey.pem \
  -out deploy/certs/fullchain.pem \
  -days 30 -nodes -subj "/CN=localhost"
echo "Development certificate written to deploy/certs. Telegram will not accept it on a phone."
