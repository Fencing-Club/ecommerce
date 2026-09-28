#!/usr/bin/env bash
# Deploys the checked-out commit to one Railway environment: the web service first (its pre-deploy step runs the
# database migrations), then the worker, so the worker never runs against an older schema. Then it waits for the
# site to report the commit. RAILWAY_TOKEN is a project token, which picks the environment.
#
#   deploy.sh <commit sha> <site url>
set -euo pipefail

sha="$1"
site="$2"

# A token pasted into `gh secret set` on Windows can carry a carriage return, which Railway rejects.
RAILWAY_TOKEN=$(printf '%s' "${RAILWAY_TOKEN:-}" | tr -d '[:space:]')
export RAILWAY_TOKEN
scope=$(curl -sS https://backboard.railway.com/graphql/v2 -H "Project-Access-Token: $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" -d '{"query":"{ projectToken { projectId environmentId } }"}')
if ! grep -q '"environmentId"' <<< "$scope"; then
  echo "::error::Railway refused the token (${#RAILWAY_TOKEN} characters): $scope"
  exit 1
fi
echo "Railway token scope: $scope"

newest() {
  railway deployment list --service "$1" --limit 1 --json | node -e '
    let input = ""
    process.stdin.on("data", (chunk) => (input += chunk)).on("end", () => {
      const [deployment] = JSON.parse(input)
      // read needs the newline, or it fails and set -e ends the script.
      console.log(deployment ? `${deployment.id} ${deployment.status}` : "none NONE")
    })'
}

deploy() {
  local service="$1" before id status
  before=$(newest "$service" | cut -d' ' -f1)
  echo "::group::Deploy $service"
  railway up --service "$service" --detach --message "$sha"
  # Railway gives the deployment an id once the upload is accepted; wait for it, then for it to settle.
  for _ in $(seq 1 180); do
    read -r id status < <(newest "$service")
    if [ "$id" != "$before" ]; then
      case "$status" in
        SUCCESS)
          echo "$service deployment $id succeeded"
          echo "::endgroup::"
          return 0
          ;;
        FAILED | CRASHED | REMOVED | SKIPPED)
          echo "::endgroup::"
          echo "::error::$service deployment $id ended $status"
          railway logs --deployment "$id" --lines 100 || true
          return 1
          ;;
      esac
    fi
    sleep 10
  done
  echo "::endgroup::"
  echo "::error::$service deployment did not finish within 30 minutes"
  return 1
}

for service in copacker copacker-worker; do
  railway variable set "APP_COMMIT_SHA=$sha" --service "$service" --skip-deploys >/dev/null
done

deploy copacker
deploy copacker-worker

# The web service is healthy by now; this confirms the address serves the new release, not an earlier one.
for _ in $(seq 1 30); do
  live=$(curl -fsS "$site/api/health" | node -e '
    let input = ""
    process.stdin.on("data", (chunk) => (input += chunk)).on("end", () => process.stdout.write(JSON.parse(input).commit ?? ""))' || true)
  if [ "$live" = "$sha" ]; then
    echo "$site serves $sha"
    exit 0
  fi
  sleep 10
done
echo "::error::$site still serves ${live:-an unknown commit}, not $sha"
exit 1
