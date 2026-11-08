#!/usr/bin/env bash
set -euo pipefail
umask 077

sha=${1:?A release commit is required}
[[ $sha =~ ^[0-9a-f]{40}$ ]] || { printf 'Invalid release commit\n' >&2; exit 1; }
releases=/home/konobbue/mojassam-releases
app=/home/konobbue/mojassam-app
node=/opt/alt/alt-nodejs24/root/usr/bin/node
release="$releases/$sha"
archive="$releases/$sha.tar.gz"
origin=https://etba3-bas.muhammadessam.me

# Serialize deployments even when someone starts one outside GitHub Actions.
exec 9>"$releases/.deploy.lock"
flock -w 300 9
[[ ! -e $release ]] || { printf 'Release already exists; use a new commit\n' >&2; exit 1; }
mkdir "$release"
tar -xzf "$archive" -C "$release"
rm "$archive"
test -f "$release/server.js"
test -f "$release/.next/BUILD_ID"
test -d "$release/node_modules/next"
printf '%s\n' "$sha" > "$release/RELEASE_SHA"

health() {
  local url=$1 expected=$2
  curl --fail --silent --show-error --max-time 10 "$url" |
    "$node" -e 'let data="";process.stdin.on("data",c=>data+=c);process.stdin.on("end",()=>{try{const h=JSON.parse(data);process.exit(h.status==="ok"&&h.version===process.argv[1]?0:1)}catch{process.exit(1)}})' "$expected"
}

# Check the exact uploaded Linux bundle without touching the production database.
APP_ORIGIN="$origin" DATA_DIRECTORY="$release/.health-data" RELEASE_SHA="$sha" HOSTNAME=127.0.0.1 PORT=3189 \
  "$node" "$release/server.js" > "$release/smoke.log" 2>&1 &
smoke_pid=$!
trap 'kill "$smoke_pid" 2>/dev/null || true' EXIT
ready=false
for attempt in $(seq 1 45); do
  if health http://127.0.0.1:3189/api/health "$sha" 2>/dev/null; then ready=true; break; fi
  if ! kill -0 "$smoke_pid" 2>/dev/null; then cat "$release/smoke.log"; exit 1; fi
  sleep 1
done
[[ $ready == true ]] || { cat "$release/smoke.log"; exit 1; }
kill "$smoke_pid"
wait "$smoke_pid" || true
trap - EXIT
rm -rf "$release/.health-data"

previous=$(readlink "$releases/current" || true)
if [[ ! -f $releases/original-server.cjs ]]; then cp "$app/server.cjs" "$releases/original-server.cjs"; fi
rollback() {
  if [[ -n $previous ]]; then
    ln -s "$previous" "$releases/current.rollback"
    mv -Tf "$releases/current.rollback" "$releases/current"
  else
    cp "$releases/original-server.cjs" "$app/server.cjs"
  fi
  mkdir -p "$app/tmp"
  touch "$app/tmp/restart.txt"
  printf 'Deployment failed; restored the previous release\n' >&2
}
trap rollback EXIT
trap 'exit 1' HUP INT TERM
ln -s "$release" "$releases/current.next"
mv -Tf "$releases/current.next" "$releases/current"
cat > "$app/server.cjs.next" <<'STARTUP'
const fs = require('node:fs');
process.env.HOSTNAME = '127.0.0.1';
process.env.RELEASE_SHA = fs.readFileSync('/home/konobbue/mojassam-releases/current/RELEASE_SHA', 'utf8').trim();
import('/home/konobbue/mojassam-releases/current/server.js').catch((error) => { console.error(error); process.exit(1); });
STARTUP
mv "$app/server.cjs.next" "$app/server.cjs"
mkdir -p "$app/tmp"
touch "$app/tmp/restart.txt"

for attempt in $(seq 1 30); do
  if health "$origin/api/health?release=$sha" "$sha" 2>/dev/null; then
    trap - EXIT HUP INT TERM
    printf 'Deployed %s\n' "$sha"
    exit 0
  fi
  sleep 2
done

printf 'Live health check failed\n' >&2
exit 1
