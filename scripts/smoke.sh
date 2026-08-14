#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"

echo "GET /health"
health="$(curl -sS -o /tmp/health.body -w "%{http_code}" "$BASE_URL/health")"
test "$health" = "200"

NOW="$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"
SINCE="$(date -u -d "-1 hour" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v-1H +"%Y-%m-%dT%H:%M:%SZ")"
UNTIL="$(date -u -d "+1 hour" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v+1H +"%Y-%m-%dT%H:%M:%SZ")"

echo "POST /logs"
ingest="$(curl -sS -o /tmp/ingest.body -w "%{http_code}" \
  -H "Content-Type: application/json" \
  -d "{\"logs\":[{\"timestamp\":\"$NOW\",\"level\":\"info\",\"service\":\"smoke\",\"message\":\"ok\",\"attributes\":{\"run\":1}}]}" \
  "$BASE_URL/logs")"
test "$ingest" = "200"
grep -q '"accepted":1' /tmp/ingest.body

echo "POST /logs malformed JSON"
bad_json="$(curl -sS -o /tmp/badjson.body -w "%{http_code}" \
  -H "Content-Type: application/json" \
  -d "{not json" \
  "$BASE_URL/logs")"
test "$bad_json" = "400"

echo "GET /logs"
query="$(curl -sS -o /tmp/query.body -w "%{http_code}" \
  "$BASE_URL/logs?service=smoke&limit=10")"
test "$query" = "200"
grep -q '"logs"' /tmp/query.body

echo "GET /logs invalid level"
bad_level="$(curl -sS -o /tmp/badlevel.body -w "%{http_code}" \
  "$BASE_URL/logs?level=critical")"
test "$bad_level" = "400"

echo "GET /logs/aggregate"
agg="$(curl -sS -G "$BASE_URL/logs/aggregate" \
  --data-urlencode "since=$SINCE" \
  --data-urlencode "until=$UNTIL" \
  --data-urlencode "bucket=1m" \
  -o /tmp/agg.body -w "%{http_code}")"
test "$agg" = "200"
grep -q '"buckets"' /tmp/agg.body

echo "Smoke tests passed"
