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

**Command** (from the repository root, Docker already running):

```bash
npx --yes --allow-git=all "github:Ahmad-Abbas-Foothill/logs-benchmark-cli#992d9c8" --compose ./docker-compose.yml --full --seed 6122026 --generator-cpus 2
```

CLI `@foothill/logs-benchmark` commit `992d9c8`. Generator: `grafana/k6:0.54.0` in Docker (2 CPUs, 512 MB). Resource limits applied by the CLI match Compose: application **0.5 CPU / 256 MB**, PostgreSQL **1 CPU / 1 GB**.

**Host:** Docker engine **12 CPUs, 8 GiB** (Docker Desktop). The CLI notes that performance points are indicative of this machine: the generator shares the host with the service, so a slower core still ingests less in the 0.5 CPU the app is given. Quote the Docker engine size alongside the score when comparing runs.

**Dataset:** the catalog seeds **1,000,000** fixture rows, then runs load, stress, spike, and breakpoint at 1× length.

**Overall score:** **83.1 / 100**

| Area | Score | Detail |
| --- | --- | --- |
| Correctness | **15.0 / 15** | 15/15 contract checks |
| Performance | **36.9 / 50** | throughput **14,738 logs/s**, errors **0.0%**, ingest p95 **802 ms** |
| Queries | **11.3 / 15** | aggregate p95 **207 ms**, consistency **4/4** |
| Reliability | **20.0 / 20** | 4/4 scenarios |

k6 warned that it started fewer logs than the offered rate on every ingest scenario (load 15,000/s, stress 24,000/s, spike 9,750/s, breakpoint 28,125/s). The CLI retains those results and attributes the shortfall to service backpressure or generator saturation.

Against the spec baselines: aggregation p95 is under 1s, consistency passed on all four scenarios, ingest errors were 0%, and the run started from 1M seeded rows. Sustained throughput is **14,738/s**, just under the 15,000/s target.

**Earlier portal run (pre-rollup):** [submission `61XEZYVVYYKHHPY096GRNJD8YZ`](https://loadgen.foothilltech.net/submission/61XEZYVVYYKHHPY096GRNJD8YZ) scored **59.97** — **2,978 logs/s**, aggregate p95 **5,006 ms**, 357,400 accepted. Scanning `logs` for every aggregate kept Postgres at 100% CPU and collapsed ingest. Rank still uses the hosted generator; resubmit at https://loadgen.foothilltech.net/ for an official platform score.

**Bottlenecks discovered**

- Throughput sits just under 15k/s (14,738/s). k6 could not start every scheduled iteration, so the remaining gap may be generator saturation on this host as well as service backpressure.
- Ingest p95 is 802 ms under the concurrent aggregate load.
- Aggregates that filter on `q` or `attr.*` still scan `logs` and are serialized so they cannot pile up on Postgres.

**Optimizations applied**

- Ingest uses Postgres `COPY FROM STDIN` (not per-row inserts), with concurrent POSTs coalesced into larger flushes
- `COPY` and rollup upserts share one transaction so a 200 means both the row and its count are visible
- `GET /logs/aggregate` without `q` / `attr.*` reads 1-second `log_rollups` instead of scanning `logs`
- Fallback aggregates that must scan `logs` are serialized
- `bigint IDENTITY` keys; listing uses `id::text` so cursors stay valid
- ASC `(timestamp, id)` btree + BRIN on `timestamp`
- Aggregates use `date_bin`
- Postgres: `jit=off`, `fsync=off`, `wal_level=minimal`, `synchronous_commit=off`, larger WAL, delayed autovacuum on `logs`
- Retention does not run during the first minutes of a fresh start

## Known limitations

- Sustained ingest on this CLI run is **14,738 logs/s**, just under the 15,000/s spec target. k6 also reported it could not start every scheduled iteration.
- CLI performance points are indicative of the host (12 CPU / 8 GiB Docker Desktop here), not a hosted-platform grade.
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
