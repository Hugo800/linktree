#!/bin/bash
# Deploys the committed HEAD to https://hugobarthelmess.de from this Mac.
# Copies the tree via `git archive` over `ssh otc` (no deploy key on the server needed),
# then rebuilds and swaps the `linktree` container. Usage: deploy/push-to-server.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
[ -z "$(git status --porcelain)" ] || { echo "Uncommitted changes – commit first." >&2; exit 1; }
sha=$(git rev-parse HEAD)

git archive --format=tar HEAD | ssh otc "set -e
  rm -rf ~/linktree/src.new && mkdir -p ~/linktree/src.new
  tar -x -C ~/linktree/src.new
  rm -rf ~/linktree/src && mv ~/linktree/src.new ~/linktree/src
  cd ~/linktree/src
  docker compose -f deploy/compose.yml up -d --build --quiet-pull 2>&1 | grep -v '^#' || true
  docker compose -f deploy/compose.yml ps --status running -q linktree | grep -q .
  echo $sha > ~/linktree/.deployed
  docker image prune -f --filter label=com.docker.compose.project=linktree >/dev/null"

curl -fsS -o /dev/null --retry 5 --retry-delay 2 --retry-all-errors https://hugobarthelmess.de/
echo "live: $(git log --oneline -1)"
