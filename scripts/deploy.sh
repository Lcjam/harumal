#!/bin/sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$PROJECT_DIR"

if [ ! -f .env ]; then
  echo "Missing production .env file." >&2
  exit 1
fi

ENV_MODE=$(stat -c '%a' .env)
if [ "$ENV_MODE" != "600" ] && [ "$ENV_MODE" != "400" ]; then
  echo "Refusing to deploy: .env permissions must be 600 or 400 (current: $ENV_MODE)." >&2
  exit 1
fi

if [ "${1:-}" != "--no-pull" ]; then
  git pull --ff-only
fi

docker compose build --pull app db gateway
docker compose up -d --remove-orphans

ATTEMPT=0
until docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"; do
  ATTEMPT=$((ATTEMPT + 1))
  if [ "$ATTEMPT" -ge 30 ]; then
    docker compose logs --tail=100 app
    exit 1
  fi
  sleep 2
done

docker image prune -f >/dev/null
echo "Harumal deployment is healthy."
