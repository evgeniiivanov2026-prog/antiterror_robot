#!/bin/sh
# Stop the virtual-machine stack. Database files stay on disk.
set -eu
cd "$(dirname "$0")/.."
docker compose --profile vm down
