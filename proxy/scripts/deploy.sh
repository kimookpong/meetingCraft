#!/usr/bin/env bash
# Deploy the Typhoon proxy and (re)set its TYPHOON_API_KEY secret.
# The key is read with a hidden prompt, verified against Typhoon, written to a private
# temp file (mode 600) for wrangler, and the file is deleted as soon as wrangler exits.
set -euo pipefail
cd "$(dirname "$0")/.."
read -rsp "วาง Typhoon API key แล้วกด Enter (ตัวอักษรจะไม่แสดง): " KEY
echo
KEY="$(printf '%s' "$KEY" | tr -d '[:space:]"'"'")"   # drop spaces/newlines/quotes from copy-paste
KEY="${KEY#Bearer}"
[ -n "$KEY" ] || { echo "ไม่ได้ใส่ key"; exit 1; }
echo "ความยาว key: ${#KEY} ตัวอักษร (ขึ้นต้นด้วย ${KEY:0:3}…)"
# Verify before deploying: a 1-token chat call must not return 401.
CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 https://api.opentyphoon.ai/v1/chat/completions \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"model":"typhoon-v2.5-30b-a3b-instruct","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}')"
if [ "$CODE" = "401" ] || [ "$CODE" = "403" ]; then
  echo "✘ Typhoon ปฏิเสธ key นี้ (HTTP $CODE) — คัดลอก key ใหม่จาก https://playground.opentyphoon.ai/ แล้วลองอีกครั้ง"
  exit 1
fi
echo "✓ Typhoon ยอมรับ key (HTTP $CODE) — กำลัง deploy…"
umask 077
TMP="$(mktemp "${TMPDIR:-/tmp}/mc-secrets.XXXXXX")"
trap 'rm -f "$TMP"' EXIT INT TERM
printf 'TYPHOON_API_KEY=%s\n' "$KEY" > "$TMP"
unset KEY
npx wrangler deploy --secrets-file "$TMP"
