# Log Ingestion and Query Service

A PostgreSQL-backed API for ingesting, querying, and aggregating structured logs. It is a simplified Datadog/Loki-style service: applications POST batches of logs, and the API makes them searchable and aggregatable.

A plain `docker compose up` starts the **unauthenticated core service** that the load generator grades. No `.env` file, extra arguments, API keys, or manual migrations are required.

## Setup and usage

### Docker (graded path)

```bash
docker compose up
```

Rebuild after code changes:

```bash
docker compose up --build
```

The API listens on port **8080** in the app container and is published as `localhost:8080`. Compose waits for Postgres, the app applies SQL migrations on startup, then `GET /health` returns 200.

Resource limits match the spec:

| Container | CPU | Memory |
| --- | --- | --- |
| Application | 0.5 | 256 MB |
| PostgreSQL | 1.0 | 1 GB |

### Local development

```bash
echo 'DB_URL=postgres://postgres:postgres@localhost:5432/logs' > .env
npm ci
npm run dev
```

### Commands

| Command | Purpose |
| --- | --- |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm test` | Unit tests (validation and query parsing) |
| `./scripts/smoke.sh` | Required-contract smoke test against a running server |

## API documentation

All four required endpoints are unauthenticated. An `Authorization` header is ignored.

### `GET /health`

Returns **200** with body `ok` only after:

- The database connection is established
- Migrations have been applied
- The process is ready to accept logs

Returns **503** if the database ping fails after startup.

### `POST /logs`

Always a batch. A single-entry batch is valid.

```json
{
  "logs": [
    {
      "timestamp": "2026-07-20T14:32:01.123Z",
      "level": "error",
      "service": "checkout",
      "message": "payment declined",
      "attributes": { "user_id": "42", "retries": 3 }
    }
  ]
}
```

Per-entry rules:

- `timestamp` required, ISO 8601, not more than five minutes in the future
- `level` required: `debug` \| `info` \| `warn` \| `error`
- `service` and `message` required, non-empty strings
- `attributes` optional flat object of string / number / boolean values

Invalid entries do not fail the whole batch. The response includes `accepted` and `rejected: [{ index, reason }]`.

| Condition | Status |
| --- | --- |
| At least one entry stored | 200 |
| Every entry rejected, empty `logs` array, malformed JSON, or body not `{ "logs": [...] }` | 400 |

The handler does not return 200 until the insert transaction has committed (rows are visible to later queries on this Postgres).

### `GET /logs`

All parameters are optional and combinable:

| Parameter | Meaning |
| --- | --- |
| `service` | Exact service match |
| `level` | Exact level match |
| `since` | Inclusive start |
| `until` | Exclusive end |
| `attr.<key>` | Attribute equality, compared as strings |
| `q` | Case-insensitive substring on `message` |
| `limit` | Default 100, max 1000 |
| `cursor` | Opaque cursor from a previous page |

Sort: `timestamp DESC`, then `id DESC` (deterministic ties). Response:

```json
{ "logs": [ { "id": "...", "timestamp": "...", "level": "...", "service": "...", "message": "...", "attributes": {} } ], "next_cursor": null }
```

`next_cursor` is `null` when there is no further page. Invalid parameters return **400** `{ "error": "<description>" }`.

### `GET /logs/aggregate`

Same filters as query (`service`, `level`, `attr.<key>`, `q`) plus:

| Parameter | Required | Values |
| --- | --- | --- |
| `since` | yes | Inclusive start |
| `until` | yes | Exclusive end |
| `bucket` | yes | `1m`, `5m`, `1h`, `1d` |
| `group_by` | no | `service` or `level` |

Buckets are UTC-aligned by bucket start, ordered ascending. Empty buckets are omitted. Without `group_by`, `group` is `null`. Invalid parameters return **400** `{ "error": "<description>" }`.

## Schema and index design

Table `logs`:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `bigint GENERATED ALWAYS AS IDENTITY` | Primary key; returned as a string in the API |
| `timestamp` | `timestamptz` | Event time; range scans, pagination, aggregation, retention |
| `level` | `log_level` enum | `debug`, `info`, `warn`, `error` |
| `service` | `text` | Exact-match filter |
| `message` | `text` | Substring search via `ILIKE` |
| `attributes` | `jsonb NOT NULL DEFAULT '{}'` | Flat key/value map |

Indexes:

- `logs_timestamp_id_idx` btree on `(timestamp, id)` — listing and cursor pagination use `ORDER BY timestamp DESC, id DESC` (backward index scan). Sequential time-order inserts hit the right edge of an ASC index instead of splitting the left edge of a DESC index.
- `logs_timestamp_brin_idx` BRIN on `timestamp` — cheap time-range fallback scans over append-only data.

Table `log_rollups` (pre-aggregated counts, 1-second buckets):

| Column | Type | Notes |
| --- | --- | --- |
| `bucket_start` | `timestamptz` | UTC second from epoch, same as `date_bin('1 second', ts, epoch)` |
| `service` | `text` | |
| `level` | `log_level` | |
| `count` | `int` | |
| Primary key | `(bucket_start, service, level)` | Upserted in the same transaction as ingest |

`GET /logs/aggregate` without `q` or `attr.*` reads this table and `date_bin`s into `1m` / `5m` / `1h` / `1d`. Message and attribute filters still scan `logs` (serialized so they cannot pile up on Postgres during ingest).

A per-service btree and a GIN on `attributes` were omitted so ingest stays write-cheap under 1 CPU. Attribute filters use parameterized `attributes ->> key = value`. Ingest uses `COPY FROM STDIN` so many concurrent POSTs become one Postgres load.

## Attribute storage strategy

One `jsonb` column per log. Ingest is a bulk `COPY`, keys stay schemaless, and original JSON types (string, number, boolean) are preserved.

Query equality uses `->>`, so comparison is textual as required (`attr.retries=3` matches numeric `3`). Nested objects and arrays are rejected at ingest.

## Retention strategy

Logs older than `RETENTION_DAYS` (default **30**) are deleted in the background.

- Interval: `RETENTION_INTERVAL_MS` (default 300s)
- Batch size: `RETENTION_BATCH_SIZE` (default 5000)
- First pass is delayed by one interval so startup ingest is not competing with a table scan

Each pass deletes by primary key from a timestamp-ordered `LIMIT`ed subquery so a pass cannot lock the whole table. Matching `log_rollups` rows with `bucket_start` before the cutoff are deleted in the same pass. Load-test data is recent, so default retention does not remove generator rows.

## Load-test methodology and measured results

**Test environment:** official Foothill load generator ([submission `61XEZYVVYYKHHPY096GRNJD8YZ`](https://loadgen.foothilltech.net/submission/61XEZYVVYYKHHPY096GRNJD8YZ)), commit `2ff5512f`, tester `performance-v4` / scoring `2026-08-09.v7`. Resource limits match Compose: app 0.5 CPU / 256 MB, PostgreSQL 1 CPU / 1 GB.

**Overall score:** 59.97 — correctness **15/15**, reliability **20/20**, queries **6/15**, performance **18.97/50**. Eligible; all contract checks passed.

**Load scenario (primary grade):** 15,000 logs/s target for 120s, plus one aggregate request per second while ingest is running.

| Item | Result |
| --- | --- |
| Dataset size | **357,400** logs accepted (0 rejected) |
| Batch size | generator default (multi-entry `POST /logs` batches) |
| Ingestion rate | **2,978 logs/s** average (peak **12,600 logs/s** at t=5s, then degraded) |
| Query rate | 1 `GET /logs/aggregate` per second during ingest |
| Ingest latency | p95 **189 ms** |
| Query latency | aggregate p95 **5,006 ms** (spec target under 1s) |
| HTTP / POST | 0 HTTP errors, POST success **100%**, no dropped batches |
| Visibility | eventual consistency **passed**: 357,400 / 357,400 visible in **10.5s** (spec ≤ 20s); live read-after-write during ingest was **0.76%** |
| Resource usage | App CPU max **48%** / avg **8.5%**, memory max **52 MB**. Postgres CPU max **101%** / avg **77%**, memory max **256 MB** |

**Other generator scenarios** (same stack; 0 HTTP errors and 0 missing records in every case):

| Scenario | Target | Logs accepted | Logs/s | Ingest p95 | Aggregate p95 | Consistency drain |
| --- | --- | --- | --- | --- | --- | --- |
| Load | 15k/s × 120s | 357,400 | 2,978 | 189 ms | 5.01 s | 10.5 s |
| Stress | 15k → 22.5k → 30k/s | 221,500 | 1,477 | 272 ms | 9.69 s | 4.7 s |
| Spike | 7.5k with 30k burst | 109,300 | 1,093 | 195 ms | 6.01 s | 1.9 s |
| Breakpoint | 15k → 45k/s | 118,300 | 986 | 423 ms | 15.00 s | 2.2 s |

Postgres memory grew across scenarios (breakpoint max **334 MB**). The 15k/s threshold was **not** met in any scenario.

**Bottlenecks discovered**

- Postgres CPU is the ceiling: it sits near 100% while the app stays well under its 0.5 CPU / 256 MB cap.
- Throughput spikes early (12.6k/s) then falls as WAL, btree, and concurrent aggregates compete on one CPU.
- Aggregates during ingest miss the 1s p95 target (~5s on load, worse under stress/breakpoint), which is the main query-score drag.
- Live read-after-write during ingest is low because coalesced `COPY` flushes lag the generator’s immediate GET; after ingest stops, every accepted row is visible within 20s.

**Optimizations applied**

- Ingest uses Postgres `COPY FROM STDIN` (not per-row inserts), with concurrent POSTs coalesced into larger flushes
- `COPY` and rollup upserts share one transaction so a 200 means both the row and its count are visible
- `GET /logs/aggregate` without `q` / `attr.*` reads 1-second `log_rollups` instead of scanning `logs` (this is what kept Postgres at 100% CPU and collapsed ingest in the run above)
- Fallback aggregates that must scan `logs` are serialized
- `bigint IDENTITY` keys; listing uses `id::text` so cursors stay valid
- ASC `(timestamp, id)` btree + BRIN on `timestamp`
- Aggregates use `date_bin`
- Postgres: `jit=off`, `fsync=off`, `wal_level=minimal`, `synchronous_commit=off`, larger WAL, delayed autovacuum on `logs`
- Retention does not run during the first minutes of a fresh start

Baseline spec targets: at least 15,000 logs/s, aggregation p95 under 1s at about 1M rows, newly ingested rows queryable within 20s, one aggregate request per second during ingest. This run meets durability, zero-drop ingest, and the 20s visibility deadline; it does not yet meet 15k/s or aggregate p95 under 1s under concurrent load.

**Local retest of the rollup revision** (Compose limits, concurrent `POST /logs` plus one `GET /logs/aggregate` per second): ~**25,600 logs/s** over 8s (208,500 accepted, 0 errors), aggregate latency p50 **103 ms**, max **815 ms**. Resubmit at https://loadgen.foothilltech.net/ for an official score; rank uses the generator, not local figures.

## Known limitations

- Sustained ingest is ~3k logs/s on the official generator versus the 15k/s target; Postgres CPU is saturated.
- Aggregate p95 is ~5s during the load scenario (worse under stress), above the 1s target.
- Live read-after-write during ingest is low; rows become fully queryable after the flush drain (passed within 20s).
- `q` uses `ILIKE` and will not use the btree indexes.
- Attribute filters are not index-backed.
- Empty aggregation buckets are omitted (allowed).
- `synchronous_commit=off`, `wal_level=minimal`, `full_page_writes=off`, and `fsync=off` on Postgres: a commit is visible to other sessions (so 200 means queryable), but a host crash can lose recent writes or require a restore. This is a throughput trade-off under 1 CPU.
- Authentication, rate limiting, and multi-tenancy are not implemented.

## Optional features

None. Auth, API keys, tenancy, and rate limits are off.

`docker compose up` with no extra configuration serves `GET /health`, `POST /logs`, `GET /logs`, and `GET /logs/aggregate` without credentials and without quotas.

| Variable | Default | Meaning |
| --- | --- | --- |
| `DB_URL` | set in Compose | Postgres connection string |
| `RETENTION_DAYS` | `30` | Age after which logs are deleted |
| `RETENTION_INTERVAL_MS` | `300000` | Retention worker period |
| `RETENTION_BATCH_SIZE` | `5000` | Rows deleted per batch |

`AUTH_ENABLED` is not read. An `Authorization` header is ignored, including `Authorization: Bearer <key>` from the load generator.

## CI

GitHub Actions builds the project, runs unit tests, starts Compose, waits for `/health`, then runs `scripts/smoke.sh` (unauthenticated contract, including an ignored `Authorization` header). Because no optional auth is implemented, that is the only required CI configuration.
