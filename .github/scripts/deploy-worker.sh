#!/usr/bin/env bash
# Retained Node executor. Web and Storybook deploy through Cloudflare in release.yml.
set -euo pipefail
sha="$1"
# Environment tokens pasted on Windows can contain a trailing carriage return.
RAILWAY_TOKEN=$(printf '%s' "${RAILWAY_TOKEN:-}" | tr -d '[:space:]')
export RAILWAY_TOKEN
deployment_status() {
  # Railway's API sometimes answers with an empty body ("error decoding response body"), so ask again a few times
  # before giving up, rather than failing a deploy that went fine.
  local answer
  for _ in 1 2 3 4 5 6; do
    answer=$(railway deployment list --service "$1" --limit 50 --json 2>/dev/null | node -e '
      let input = ""
      process.stdin.on("data", (chunk) => (input += chunk)).on("end", () => {
        try {
          const deployment = JSON.parse(input).find((row) => row.id === process.argv[1])
          console.log(deployment?.status ?? "WAITING")
        } catch {}
      })' "$2" || true)
    if [ -n "$answer" ]; then
      echo "$answer"
      return 0
    fi
    sleep 5
  done
  echo "::error::Railway didn't list $1's deployments" >&2
  return 1
}

deploy() {
  local service="$1" id status
  echo "::group::Deploy $service"
  id=$(railway up --service "$service" --detach --json --message "$sha" | node -e '
    let input = ""
    process.stdin.on("data", (chunk) => (input += chunk)).on("end", () => {
      const { deploymentId } = JSON.parse(input)
      if (typeof deploymentId !== "string" || !deploymentId) throw new Error("Railway returned no deployment ID")
      console.log(deploymentId)
    })')
  # Track the upload's exact deployment, even if someone starts another deployment while this one is building.
  for _ in $(seq 1 180); do
    status=$(deployment_status "$service" "$id")
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
    sleep 10
  done
  echo "::endgroup::"
  echo "::error::$service deployment did not finish within 30 minutes"
  return 1
}

railway variable set "APP_COMMIT_SHA=$sha" --service copacker-worker --skip-deploys >/dev/null
deploy copacker-worker
