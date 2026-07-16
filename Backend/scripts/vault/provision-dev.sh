#!/bin/bash

# Vault Development Secrets Provisioning Script
# This script initialises Vault with development secrets for the Stellara
# project and provides helper commands for rotating secrets at runtime.
#
# Usage:
#   ./scripts/vault/provision-dev.sh              # provision all secrets
#   ./scripts/vault/provision-dev.sh rotate-jwt   # rotate JWT_SECRET
#   ./scripts/vault/provision-dev.sh rotate-redis # rotate REDIS_PASSWORD
#   ./scripts/vault/provision-dev.sh rotate-db    # rotate DB_PASSWORD
#   ./scripts/vault/provision-dev.sh rotate-all   # rotate all secrets

set -euo pipefail

# ── Colour helpers ───────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Colour

# ── Defaults ─────────────────────────────────────────────────────────────────
: "${VAULT_ADDR:=http://localhost:8200}"
: "${VAULT_TOKEN:=devroot}"
: "${BACKEND_API:=http://localhost:3000}"

export VAULT_ADDR VAULT_TOKEN

COMMAND="${1:-provision}"

# ── Preflight checks ─────────────────────────────────────────────────────────
check_vault() {
  echo -e "${YELLOW}Checking Vault connection at ${VAULT_ADDR}...${NC}"
  if ! vault status > /dev/null 2>&1; then
    echo -e "${RED}Error: Vault is not running or unreachable at ${VAULT_ADDR}!${NC}"
    echo "Start Vault with: vault server -dev"
    exit 1
  fi
  echo -e "${GREEN}✓ Vault is running${NC}"
}

# ── Enable KV engine ─────────────────────────────────────────────────────────
ensure_kv_engine() {
  echo -e "${YELLOW}Configuring KV v2 secrets engine...${NC}"
  if vault secrets list | grep -q "^kv/"; then
    echo -e "${GREEN}✓ KV v2 already enabled${NC}"
  else
    vault secrets enable -version=2 kv
    echo -e "${GREEN}✓ KV v2 enabled${NC}"
  fi
}

# ── Provision all dev secrets ─────────────────────────────────────────────────
provision() {
  check_vault
  ensure_kv_engine

  echo -e "${YELLOW}Creating development secrets...${NC}"

  # Database
  echo "→ Creating database credentials..."
  vault kv put kv/stellara/database/postgres \
      host=localhost \
      port=5432 \
      username=postgres \
      password=devpassword \
      database=stellara_db
  echo -e "${GREEN}✓ Database credentials created${NC}"

  # JWT
  echo "→ Creating JWT secret..."
  JWT_SECRET=$(openssl rand -base64 48)
  vault kv put kv/stellara/auth/jwt \
      secret="${JWT_SECRET}"
  echo -e "${GREEN}✓ JWT secret created${NC}"

  # Redis
  echo "→ Creating Redis configuration..."
  vault kv put kv/stellara/redis/cache \
      host=localhost \
      port=6379 \
      password=""
  echo -e "${GREEN}✓ Redis configuration created${NC}"

  # Stellar
  echo "→ Creating Stellar configuration..."
  vault kv put kv/stellara/external/stellar \
      rpc-url=https://horizon-testnet.stellar.org \
      "network-passphrase=Test SDF Network ; September 2015"
  echo -e "${GREEN}✓ Stellar configuration created${NC}"

  # LLM
  echo "→ Creating LLM configuration..."
  vault kv put kv/stellara/external/llm \
      api-key=sk-dev-key-for-testing \
      base-url=https://api.openai.com/v1
  echo -e "${GREEN}✓ LLM configuration created${NC}"

  # Stripe (optional)
  echo "→ Creating Stripe configuration..."
  vault kv put kv/stellara/external/stripe \
      secret-key=sk_test_development \
      publishable-key=pk_test_development
  echo -e "${GREEN}✓ Stripe configuration created${NC}"

  # Verify secrets
  echo -e "${YELLOW}Verifying secrets...${NC}"
  echo "Available secrets:"
  vault kv list kv/stellara/ | sed 's/^/  /'

  echo -e "${GREEN}✓ All secrets created successfully!${NC}"
  echo ""
  echo -e "${YELLOW}Next steps:${NC}"
  echo "1. Set environment variables:"
  echo "   export VAULT_ADDR='${VAULT_ADDR}'"
  echo "   export VAULT_TOKEN='${VAULT_TOKEN}'"
  echo ""
  echo "2. Create Backend/.env with VAULT_ENABLED=true"
  echo ""
  echo "3. Start the backend:"
  echo "   cd Backend && npm run start:dev"
  echo ""
  echo "4. View a secret:"
  echo "   vault kv get kv/stellara/database/postgres"
  echo ""
  echo -e "${CYAN}Rotation commands:${NC}"
  echo "   $0 rotate-jwt    # Rotate JWT_SECRET"
  echo "   $0 rotate-redis  # Rotate REDIS_PASSWORD"
  echo "   $0 rotate-db     # Rotate DB_PASSWORD"
  echo "   $0 rotate-all    # Rotate all secrets"
}

# ── Notify the running app of a rotation ────────────────────────────────────
# POSTs to the internal /api/secrets/rotate endpoint if the backend is up.
# This endpoint is only accessible on localhost and requires an operator token.
notify_app() {
  local secret_key="$1"
  local new_value="$2"

  # Update process env exported to the backend (works when using dotenv reload)
  echo -e "${CYAN}  → Notifying app of ${secret_key} rotation...${NC}"

  # Attempt HTTP notification (non-fatal – app may not be running yet)
  if command -v curl &>/dev/null; then
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
      -X POST "${BACKEND_API}/api/secrets/rotate" \
      -H 'Content-Type: application/json' \
      -d "{\"secretKey\":\"${secret_key}\",\"reason\":\"vault-renewal\"}" \
      2>/dev/null || echo "000")

    if [ "${HTTP_STATUS}" = "200" ] || [ "${HTTP_STATUS}" = "201" ]; then
      echo -e "${GREEN}  ✓ App notified of ${secret_key} rotation (HTTP ${HTTP_STATUS})${NC}"
    else
      echo -e "${YELLOW}  ⚠ App notification skipped (HTTP ${HTTP_STATUS}) — app may not be running${NC}"
    fi
  fi
}

# ── Rotate JWT_SECRET ────────────────────────────────────────────────────────
rotate_jwt() {
  check_vault
  echo -e "${YELLOW}Rotating JWT_SECRET...${NC}"

  # Archive current value as 'previous' for a grace period
  CURRENT=$(vault kv get -field=secret kv/stellara/auth/jwt 2>/dev/null || echo "")
  NEW_SECRET=$(openssl rand -base64 48)

  vault kv put kv/stellara/auth/jwt \
      secret="${NEW_SECRET}" \
      previous="${CURRENT}"

  echo -e "${GREEN}✓ JWT_SECRET rotated in Vault${NC}"
  echo "  New version stored; old version kept under 'previous' key for grace period"

  # Export so child processes / .env reloaders can pick it up
  export JWT_SECRET="${NEW_SECRET}"

  notify_app "JWT_SECRET" "${NEW_SECRET}"

  echo -e "${GREEN}✓ JWT rotation complete${NC}"
}

# ── Rotate REDIS_PASSWORD ────────────────────────────────────────────────────
rotate_redis() {
  check_vault
  echo -e "${YELLOW}Rotating REDIS_PASSWORD...${NC}"

  NEW_REDIS_PASSWORD=$(openssl rand -base64 24)

  vault kv patch kv/stellara/redis/cache \
      password="${NEW_REDIS_PASSWORD}"

  echo -e "${GREEN}✓ REDIS_PASSWORD rotated in Vault${NC}"

  export REDIS_PASSWORD="${NEW_REDIS_PASSWORD}"

  notify_app "REDIS_PASSWORD" "${NEW_REDIS_PASSWORD}"

  echo -e "${GREEN}✓ Redis rotation complete${NC}"
  echo -e "${YELLOW}  Remember to also update the Redis server's requirepass directive${NC}"
}

# ── Rotate DB_PASSWORD ───────────────────────────────────────────────────────
rotate_db() {
  check_vault
  echo -e "${YELLOW}Rotating DB_PASSWORD...${NC}"

  NEW_DB_PASSWORD=$(openssl rand -base64 24)

  vault kv patch kv/stellara/database/postgres \
      password="${NEW_DB_PASSWORD}"

  echo -e "${GREEN}✓ DB_PASSWORD rotated in Vault${NC}"

  export DB_PASSWORD="${NEW_DB_PASSWORD}"

  # In dev: update the Postgres user password directly if psql is available
  if command -v psql &>/dev/null; then
    echo -e "${CYAN}  → Updating Postgres user password...${NC}"
    DB_HOST=$(vault kv get -field=host kv/stellara/database/postgres 2>/dev/null || echo "localhost")
    DB_PORT=$(vault kv get -field=port kv/stellara/database/postgres 2>/dev/null || echo "5432")
    DB_USER=$(vault kv get -field=username kv/stellara/database/postgres 2>/dev/null || echo "postgres")
    PGPASSWORD="${NEW_DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" \
      -c "ALTER USER ${DB_USER} WITH PASSWORD '${NEW_DB_PASSWORD}';" \
      && echo -e "${GREEN}  ✓ Postgres password updated${NC}" \
      || echo -e "${YELLOW}  ⚠ Could not update Postgres password automatically — update manually${NC}"
  else
    echo -e "${YELLOW}  ⚠ psql not found — update DB user password manually${NC}"
  fi

  notify_app "DB_PASSWORD" "${NEW_DB_PASSWORD}"

  echo -e "${GREEN}✓ DB rotation complete${NC}"
}

# ── Rotate all secrets ───────────────────────────────────────────────────────
rotate_all() {
  echo -e "${CYAN}Rotating all secrets...${NC}"
  rotate_jwt
  rotate_redis
  rotate_db
  echo -e "${GREEN}✓ All secrets rotated${NC}"
}

# ── Dispatch ─────────────────────────────────────────────────────────────────
case "${COMMAND}" in
  provision)
    provision
    ;;
  rotate-jwt)
    rotate_jwt
    ;;
  rotate-redis)
    rotate_redis
    ;;
  rotate-db)
    rotate_db
    ;;
  rotate-all)
    rotate_all
    ;;
  *)
    echo -e "${RED}Unknown command: ${COMMAND}${NC}"
    echo "Usage: $0 [provision|rotate-jwt|rotate-redis|rotate-db|rotate-all]"
    exit 1
    ;;
esac
