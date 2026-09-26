#!/bin/bash
# Deployt einen Commit von origin/main nach https://hugobarthelmess.de (Linktree).
# Liegt auf dem OTC-Server als ~/linktree/deploy.sh (Kopie, nicht im Klon: das Skript soll sich
# nicht selbst per merge ändern). Aufruf durch GitHub Actions per SSH: Der CI-Schlüssel in
# ~/.ssh/authorized_keys ist mit restrict,command="…/deploy.sh" auf dieses Skript beschränkt,
# der Commit kommt als SSH_ORIGINAL_COMMAND.
# Von Hand: ~/linktree/deploy.sh main   (oder eine 40-stellige Commit-ID)
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

exec 9>/tmp/linktree-deploy.lock
flock -w 900 9   # zwei Pushes kurz nacheinander: nacheinander abarbeiten

ref="${1:-${SSH_ORIGINAL_COMMAND:-}}"
git -C repo fetch -q origin main
if [ "$ref" = main ]; then
  sha=$(git -C repo rev-parse origin/main)
elif [[ "$ref" =~ ^[0-9a-f]{40}$ ]]; then
  sha=$ref
else
  echo "Aufruf: deploy.sh main | deploy.sh <40-stellige Commit-ID>" >&2; exit 2
fi
git -C repo merge-base --is-ancestor "$sha" origin/main \
  || { echo "$sha liegt nicht auf origin/main" >&2; exit 3; }

live=$(cat .deployed 2>/dev/null || true)
if [ "$live" = "$sha" ]; then echo "$sha ist schon live"; exit 0; fi
if [ -n "$live" ] && git -C repo merge-base --is-ancestor "$sha" "$live" 2>/dev/null; then
  echo "$sha ist älter als der Live-Stand $live – übersprungen"; exit 0
fi

git -C repo merge -q --ff-only "$sha"
compose=(docker compose -f repo/deploy/compose.yml)
# `|| true` only for grep (exits 1 when it filters every line); a failed build must stop here,
# before .deployed records the new commit.
if ! "${compose[@]}" up -d --build --quiet-pull 2>&1 | { grep -v '^#' || true; }; then
  echo "docker compose up fehlgeschlagen – .deployed bleibt ${live:-leer}" >&2; exit 5
fi
"${compose[@]}" ps --status running -q linktree | grep -q . \
  || { echo "Container läuft nicht" >&2; exit 4; }
echo "$sha" > .deployed
docker image prune -f --filter label=com.docker.compose.project=linktree >/dev/null
echo "live: $(git -C repo log --oneline -1)"
