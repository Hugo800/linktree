#!/bin/bash
# One-time setup of the CI/CD deployment, run by Hugo on the Mac (needs `ssh otc` and `gh`).
# Creates two keys:
#  1. A read-only GitHub deploy key on the server, for the clone ~/linktree/repo.
#  2. A key for GitHub Actions. In ~ubuntu/.ssh/authorized_keys it is restricted to
#     ~/linktree/deploy.sh; the private part only ends up in the repo secret DEPLOY_SSH_KEY
#     and is deleted locally.
# Afterwards every green push to main goes live on https://hugobarthelmess.de.
set -euo pipefail
REPO=Hugo800/linktree
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "1/4 Read-only deploy key on the server"
ssh otc 'set -e
  test -f ~/.ssh/id_ed25519_github_linktree || ssh-keygen -q -t ed25519 -N "" -C "otc-server linktree (read-only)" -f ~/.ssh/id_ed25519_github_linktree
  grep -q "^Host github-linktree$" ~/.ssh/config || printf "\n# Lese-Deploy-Key für das private Repo Hugo800/linktree (~/linktree/repo)\nHost github-linktree\n    HostName github.com\n    User git\n    IdentityFile ~/.ssh/id_ed25519_github_linktree\n    IdentitiesOnly yes\n" >> ~/.ssh/config
  cat ~/.ssh/id_ed25519_github_linktree.pub' > "$tmp/server.pub"
gh repo deploy-key list --repo "$REPO" | grep -q "otc-server" \
  || gh repo deploy-key add "$tmp/server.pub" --repo "$REPO" --title "otc-server (read-only)"

echo "2/4 Clone and deploy script on the server, first deployment"
ssh otc 'set -e
  cd ~/linktree
  test -d repo || git clone -q github-linktree:Hugo800/linktree.git repo
  install -m 755 repo/deploy/server-deploy.sh deploy.sh
  rm -f .deployed
  ./deploy.sh main
  rm -rf src'

echo "3/4 CI key, restricted to ~/linktree/deploy.sh"
if ssh otc 'grep -q "command=\"/home/ubuntu/linktree/deploy.sh\"" ~/.ssh/authorized_keys'; then
  echo "    already in authorized_keys – skipped (remove that line first to rotate the key)"
else
  ssh-keygen -q -t ed25519 -N "" -C "github-actions $REPO" -f "$tmp/ci"
  ssh otc "cp -p ~/.ssh/authorized_keys ~/.ssh/authorized_keys.bak-\$(date +%Y%m%d%H%M) \
    && echo 'restrict,command=\"/home/ubuntu/linktree/deploy.sh\" $(cat "$tmp/ci.pub")' >> ~/.ssh/authorized_keys"
  gh secret set DEPLOY_SSH_KEY --repo "$REPO" < "$tmp/ci"
  # Host key from the Mac's own known_hosts, not a fresh keyscan.
  ssh-keygen -F 164.30.69.35 | grep -v '^#' | gh secret set DEPLOY_KNOWN_HOSTS --repo "$REPO"
fi

echo "4/4 Enable the deploy job"
gh variable set DEPLOY_ENABLED --repo "$REPO" --body true
echo "Done. Test run: gh workflow run ci.yml --repo $REPO"
