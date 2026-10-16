#!/usr/bin/env bash
# Retained Node executor. Web and Storybook deploy through Cloudflare in release.yml.
set -euo pipefail
sha="$1"
newest() {
  # Railway's API sometimes answers with an empty body ("error decoding response body"), so ask again a few times
  # before giving up, rather than failing a deploy that went fine.
  local answer
  for _ in 1 2 3 4 5 6; do
    answer=$(railway deployment list --service "$1" --limit 1 --json 2>/dev/null | node -e '
      let input = ""
      process.stdin.on("data", (chunk) => (input += chunk)).on("end", () => {
        try {
          const [deployment] = JSON.parse(input)
          console.log(deployment ? `${deployment.id} ${deployment.status}` : "none NONE")
        } catch {}
      })' || true)
    if [ -n "$answer" ]; then
      # read needs the newline, or it fails and set -e ends the script.
      echo "$answer"
      return 0
    fi
    sleep 5
  done
  echo "::error::Railway didn't list $1's deployments" >&2
  return 1
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


railway variable set "APP_COMMIT_SHA=$sha" --service copacker-worker --skip-deploys >/dev/null
deploy copacker-worker
