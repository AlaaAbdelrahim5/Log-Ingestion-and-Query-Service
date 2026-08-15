#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"

json_get() {
  local path="$1"
  shift
  curl -sS -o /tmp/body -w "%{http_code}" "$@" "$BASE_URL$path"
}

echo "GET /health"
health="$(json_get /health)"
test "$health" = "200"

NOW="$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"
SINCE="$(date -u -d "-1 hour" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v-1H +"%Y-%m-%dT%H:%M:%SZ")"
UNTIL="$(date -u -d "+1 hour" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v+1H +"%Y-%m-%dT%H:%M:%SZ")"

echo "POST /logs"
ingest="$(json_get /logs -H "Content-Type: application/json" \
  -d "{\"logs\":[{\"timestamp\":\"$NOW\",\"level\":\"info\",\"service\":\"smoke\",\"message\":\"payment declined\",\"attributes\":{\"user_id\":\"42\",\"retries\":3}}]}")"
test "$ingest" = "200"
grep -q '"accepted":1' /tmp/body

echo "POST /logs mixed batch"
mixed="$(json_get /logs -H "Content-Type: application/json" \
  -d "{\"logs\":[{\"timestamp\":\"$NOW\",\"level\":\"error\",\"service\":\"smoke\",\"message\":\"ok\"},{\"timestamp\":\"$NOW\",\"level\":\"critical\",\"service\":\"smoke\",\"message\":\"nope\"}]}")"
test "$mixed" = "200"
grep -q '"accepted":1' /tmp/body
grep -q '"index":1' /tmp/body

echo "POST /logs empty batch"
empty="$(json_get /logs -H "Content-Type: application/json" -d '{"logs":[]}')"
test "$empty" = "400"

echo "POST /logs malformed JSON"
bad_json="$(json_get /logs -H "Content-Type: application/json" -d "{not json")"
test "$bad_json" = "400"
grep -q '"error"' /tmp/body

echo "POST /logs bad top-level shape"
bad_shape="$(json_get /logs -H "Content-Type: application/json" -d '{"not":"logs"}')"
test "$bad_shape" = "400"
grep -q '"error"' /tmp/body

echo "GET /logs"
query="$(json_get "/logs?service=smoke&limit=10")"
test "$query" = "200"
grep -q '"logs"' /tmp/body
grep -q '"next_cursor"' /tmp/body

echo "GET /logs ignores Authorization when auth is off"
authed="$(json_get "/logs?service=smoke&limit=1" -H "Authorization: Bearer unused")"
test "$authed" = "200"
grep -q '"logs"' /tmp/body

echo "GET /logs attr filter"
attr="$(json_get "/logs?service=smoke&attr.user_id=42&limit=10")"
test "$attr" = "200"
grep -q '"logs"' /tmp/body

echo "GET /logs q filter"
q="$(json_get "/logs?service=smoke&q=declined&limit=10")"
test "$q" = "200"
grep -q '"logs"' /tmp/body

echo "GET /logs invalid level"
bad_level="$(json_get "/logs?level=critical")"
test "$bad_level" = "400"
grep -q '"error"' /tmp/body

echo "GET /logs invalid limit"
bad_limit="$(json_get "/logs?limit=0")"
test "$bad_limit" = "400"

echo "GET /logs malformed cursor"
bad_cursor="$(json_get "/logs?cursor=not-a-cursor")"
test "$bad_cursor" = "400"

echo "GET /logs/aggregate"
agg="$(curl -sS -G "$BASE_URL/logs/aggregate" \
  --data-urlencode "since=$SINCE" \
  --data-urlencode "until=$UNTIL" \
  --data-urlencode "bucket=1m" \
  -o /tmp/body -w "%{http_code}")"
test "$agg" = "200"
grep -q '"buckets"' /tmp/body
grep -q '"group":null' /tmp/body

echo "GET /logs/aggregate group_by=level"
agg_group="$(curl -sS -G "$BASE_URL/logs/aggregate" \
  --data-urlencode "since=$SINCE" \
  --data-urlencode "until=$UNTIL" \
  --data-urlencode "bucket=1m" \
  --data-urlencode "group_by=level" \
  -o /tmp/body -w "%{http_code}")"
test "$agg_group" = "200"
grep -q '"buckets"' /tmp/body

echo "GET /logs/aggregate missing since"
agg_bad="$(json_get "/logs/aggregate?until=$UNTIL&bucket=1m")"
test "$agg_bad" = "400"
grep -q '"error"' /tmp/body

echo "GET /logs until earlier than since"
range_bad="$(json_get "/logs?since=$UNTIL&until=$SINCE")"
test "$range_bad" = "400"
grep -q '"error"' /tmp/body

echo "Smoke tests passed"
