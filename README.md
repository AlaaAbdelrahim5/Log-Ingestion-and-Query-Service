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
- `logs_timestamp_brin_idx` BRIN on `timestamp` — cheap time-range aggregates over append-only data.

A per-service btree and a GIN on `attributes` were omitted so ingest stays write-cheap under 1 CPU. Attribute filters use parameterized `attributes ->> key = value`. Ingest uses `COPY FROM STDIN` so many concurrent POSTs become one Postgres load.

## Attribute storage strategy

One `jsonb` column per log. Ingest is a bulk `COPY`, keys stay schemaless, and original JSON types (string, number, boolean) are preserved.

Query equality uses `->>`, so comparison is textual as required (`attr.retries=3` matches numeric `3`). Nested objects and arrays are rejected at ingest.

## Retention strategy

Logs older than `RETENTION_DAYS` (default **30**) are deleted in the background.

- Interval: `RETENTION_INTERVAL_MS` (default 300s)
- Batch size: `RETENTION_BATCH_SIZE` (default 5000)
- First pass is delayed by one interval so startup ingest is not competing with a table scan

Each pass deletes by primary key from a timestamp-ordered `LIMIT`ed subquery so a pass cannot lock the whole table. Load-test data is recent, so default retention does not remove generator rows.

## Load-test methodology and measured results

**Test environment:** this Compose stack (app 0.5 CPU / 256 MB, Postgres 1 CPU / 1 GB) on WSL2.

**Official generator** ([this submission](https://loadgen.foothilltech.net/submission/4NPJBYZZZFC55VN3A0QQDN5AG9)), before the current ingest/query rewrite:

| Scenario | Logs/s | Aggregate p95 | POST success | Eventual consistency |
| --- | --- | --- | --- | --- |
| Load (15k/s × 120s) | **1,299** | 8.40s | 100% | Failed (`GET /logs` **500**, 1k visible / 156k accepted) |
| Stress | 616 | 16.50s | 100% | Failed |
| Spike | 471 | 10.21s | 100% | Failed |
| Breakpoint | 413 | 27.95s | 100% | Failed |

Postgres CPU was pegged at ~100%. The query path broke after the first page, which is why consistency and query scores collapsed even though every POST returned 200.

**Local retest of this revision** (concurrent `POST /logs` plus one `GET /logs/aggregate` per second, then cursor pagination):

| Item | Result |
| --- | --- |
| Dataset size | ~162k rows ingested in the timed run |
| Batch size | 500 logs/request, 24 concurrent clients |
| Ingestion rate | ~**13,000 logs/s** over 12.5s, 0 HTTP errors |
| Query rate | 1 `GET /logs/aggregate` per second during ingest, then cursor pagination |
| Ingest latency | p50 ~886 ms, p95 ~1.35 s (requests wait on coalesced flushes) |
| Query latency | aggregate p95 **~358 ms** (`bucket=1m`); list pages p95 ~62 ms, **163 pages, 0 errors** |
| Visibility | all accepted rows readable after ingest (no missing records) |
| Resource usage | App well under 256 MB; Postgres is the remaining ingest bottleneck |

**Optimizations applied after that official run:**

- Ingest uses Postgres `COPY FROM STDIN` (not per-row ORM inserts), with concurrent POSTs coalesced into larger flushes
- `bigint IDENTITY` keys; listing uses `id::text` so cursors stay valid
- ASC `(timestamp, id)` btree + BRIN on `timestamp`
- Aggregates use `date_bin`
- Postgres: `jit=off`, `wal_level=minimal`, `synchronous_commit=off`, larger WAL, no extra btree on `service`
- Retention does not run during the first minutes of a fresh start

Push this revision and resubmit at https://loadgen.foothilltech.net/ — rank is computed from a new generator run, not from README figures.

Baseline spec targets: ≥ 15,000 logs/s, aggregation p95 < 1s at ~1M rows, newly ingested rows queryable within 20s, one aggregate request per second during ingest.

## Known limitations

- `q` uses `ILIKE` and will not use the btree indexes.
- Attribute filters are not index-backed.
- Empty aggregation buckets are omitted (allowed).
- `synchronous_commit=off`, `wal_level=minimal`, and `full_page_writes=off` on Postgres: a commit is visible to other sessions (so 200 means queryable), but a host crash can lose recent writes or require a restore. This is a throughput trade-off under 1 CPU.
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
