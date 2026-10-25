#!/usr/bin/env sh
# Clone (or update) the app from GitHub and start the server on the ingress port.
set -eu

OPTS=/data/options.json
read_opt() { node -e "try{process.stdout.write(String(require('${OPTS}').$1||''))}catch(e){process.stdout.write('')}" 2>/dev/null || true; }

REPO="$(read_opt repo)"; REF="$(read_opt ref)"
REPO="${REPO:-https://github.com/AndriiDzhus/fuzzy-logic-security-risk.git}"
REF="${REF:-main}"
APP=/data/app

# Real-device backend: the ESP32 the gateway monitors (set in the add-on options).
DEVICE_HOST="$(read_opt device_host)"
DEVICE_NAME="$(read_opt device_name)"
DEVICE_ID="$(read_opt device_id)"
export DEVICE_HOST DEVICE_NAME DEVICE_ID

echo "[fuzzy-controller] repo=${REPO} ref=${REF}"
if [ ! -d "${APP}/.git" ]; then
  echo "[fuzzy-controller] cloning..."
  git clone --branch "${REF}" --depth 1 "${REPO}" "${APP}"
else
  echo "[fuzzy-controller] updating..."
  git -C "${APP}" fetch --depth 1 origin "${REF}"
  git -C "${APP}" reset --hard FETCH_HEAD
fi

cd "${APP}"
echo "[fuzzy-controller] installing dependencies..."
npm install --omit=dev --no-audit --no-fund

export PORT=3002
echo "[fuzzy-controller] starting server on port ${PORT}"
exec node server.js
