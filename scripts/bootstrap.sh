#!/usr/bin/env bash
#
# One-shot Cloudflare resource provisioning + wrangler.jsonc patch.
#
# Pre-req: `wrangler login` succeeded for the target account.
#
# Idempotent: re-runs detect existing resources (D1 db named tegunews, KV
# namespace CACHE, R2 bucket tegunews-media) and skip creation. The patch
# step uses sed to replace REPLACE_WITH_* placeholders only — running again
# after a successful patch is a no-op (no placeholders left to match).
#
# Usage:
#   bash scripts/bootstrap.sh
#
# Outputs ID values to stderr for capture if you need to set GitHub Actions
# secrets / .env files manually.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

note() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*" >&2; }
ok()   { printf '  \033[1;32m✓\033[0m %s\n' "$*" >&2; }
warn() { printf '  \033[1;33m!\033[0m %s\n' "$*" >&2; }

if ! command -v wrangler >/dev/null; then
  echo "wrangler not found. Run: pnpm add -g wrangler" >&2
  exit 1
fi

if ! wrangler whoami >/dev/null 2>&1; then
  echo "Not logged in. Run: wrangler login" >&2
  exit 1
fi

# ─── D1 ─────────────────────────────────────────────────────────────────────
note "D1 database (tegunews)"
D1_LIST=$(wrangler d1 list --json 2>/dev/null || echo '[]')
D1_ID=$(echo "$D1_LIST" | node -e 'let d=""; process.stdin.on("data",c=>d+=c).on("end",()=>{const a=JSON.parse(d);const r=a.find(x=>x.name==="tegunews");process.stdout.write(r?r.uuid:"")})')

if [ -z "$D1_ID" ]; then
  CREATE_OUTPUT=$(wrangler d1 create tegunews 2>&1)
  D1_ID=$(echo "$CREATE_OUTPUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
  ok "Created D1: $D1_ID"
else
  ok "D1 exists: $D1_ID"
fi

# ─── KV (CACHE + preview) ───────────────────────────────────────────────────
note "KV namespace (CACHE)"
KV_LIST=$(wrangler kv namespace list 2>/dev/null || echo '[]')

KV_ID=$(echo "$KV_LIST" | node -e 'let d=""; process.stdin.on("data",c=>d+=c).on("end",()=>{try{const a=JSON.parse(d);const r=a.find(x=>x.title==="CACHE");process.stdout.write(r?r.id:"")}catch{process.stdout.write("")}})')
if [ -z "$KV_ID" ]; then
  KV_ID=$(wrangler kv namespace create CACHE 2>&1 | grep -oE 'id = "[a-f0-9]+"' | sed 's/id = "//;s/"//')
  ok "Created KV CACHE: $KV_ID"
else
  ok "KV CACHE exists: $KV_ID"
fi

KV_PREVIEW_ID=$(echo "$KV_LIST" | node -e 'let d=""; process.stdin.on("data",c=>d+=c).on("end",()=>{try{const a=JSON.parse(d);const r=a.find(x=>x.title==="CACHE_preview");process.stdout.write(r?r.id:"")}catch{process.stdout.write("")}})')
if [ -z "$KV_PREVIEW_ID" ]; then
  KV_PREVIEW_ID=$(wrangler kv namespace create CACHE --preview 2>&1 | grep -oE 'preview_id = "[a-f0-9]+"' | sed 's/preview_id = "//;s/"//')
  ok "Created KV CACHE preview: $KV_PREVIEW_ID"
else
  ok "KV CACHE preview exists: $KV_PREVIEW_ID"
fi

# ─── R2 ─────────────────────────────────────────────────────────────────────
note "R2 buckets"
for b in tegunews-media tegunews-media-dev; do
  if wrangler r2 bucket list 2>/dev/null | grep -q "^$b\$"; then
    ok "R2 bucket exists: $b"
  else
    wrangler r2 bucket create "$b" >/dev/null
    ok "Created R2 bucket: $b"
  fi
done

# ─── Patch wrangler.jsonc ───────────────────────────────────────────────────
note "Patching wrangler.jsonc files"
for f in apps/web/wrangler.jsonc apps/admin/wrangler.jsonc apps/cron/wrangler.jsonc; do
  if [ ! -f "$f" ]; then
    warn "Skip (missing): $f"
    continue
  fi
  # Use a sentinel temp file so each sed substitution is auditable.
  sed -i.bak \
    -e "s/REPLACE_WITH_D1_DATABASE_ID/$D1_ID/g" \
    -e "s/REPLACE_WITH_KV_NAMESPACE_ID/$KV_ID/g" \
    -e "s/REPLACE_WITH_KV_PREVIEW_ID/$KV_PREVIEW_ID/g" \
    "$f"
  rm "$f.bak"
  ok "Patched: $f"
done

# ─── Migrations ─────────────────────────────────────────────────────────────
note "D1 migrations (local)"
( cd apps/web && wrangler d1 migrations apply tegunews --local ) || warn "Local apply failed — fix and re-run"

note "Done."
echo >&2
echo "Next steps:" >&2
echo "  1. wrangler secret put BETTER_AUTH_SECRET   # in apps/admin" >&2
echo "  2. cd apps/web && wrangler d1 migrations apply tegunews   # remote" >&2
echo "  3. pnpm --filter @teguns/web   build:cf && pnpm --filter @teguns/web   run deploy" >&2
echo "  4. pnpm --filter @teguns/admin build:cf && pnpm --filter @teguns/admin run deploy" >&2
echo "  5. pnpm --filter @teguns/cron  run deploy" >&2
