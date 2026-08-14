# Log Ingestion and Query Service

A PostgreSQL-backed API for ingesting, querying, and aggregating structured logs. A plain `docker compose up` starts the unauthenticated core service that the load generator expects.

## Setup and usage

### Docker (required)

```bash
docker compose up --build
```

The API is available at `http://localhost:8080`. No `.env` file, extra arguments, or manual migrations are required. The app waits for Postgres, applies Drizzle migrations, then serves traffic. `GET /health` returns 200 only after that.

### Local development

```bash
# Postgres must be reachable at DB_URL
echo 'DB_URL=postgres://postgres:postgres@localhost:5432/logs' > .env
npm ci
npm run generate   # only after schema changes
npm run dev
```

### Useful commands

| Command | Purpose |
| --- | --- |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm test` | Unit tests (validation and query parsing) |
| `./scripts/smoke.sh` | Contract smoke test against a running server |

## API documentation

All four required endpoints are unauthenticated by default.

### `GET /health`

Returns `200` with body `ok` once the database is connected, migrations have been applied, and the process is ready to ingest logs. Returns `503` if the database ping fails.

### `POST /logs`

Ingests a batch. Invalid entries are rejected individually; valid entries are stored.

**200** if at least one entry is accepted. **400** if every entry is rejected, the JSON is malformed, or the body is not `{ "logs": [...] }`.

### `GET /logs`

Optional filters, freely combined: `service`, `level`, `since` (inclusive), `until` (exclusive), `attr.<key>` (string equality), `q` (case-insensitive message substring), `limit` (default 100, max 1000), `cursor`.

Results are `timestamp DESC`, then `id DESC`. `next_cursor` is `null` when there is no next page. Invalid parameters return **400** `{ "error": "<description>" }`.

### `GET /logs/aggregate`

Same filters as query (`service`, `level`, `attr.<key>`, `q`) plus required `since`, `until`, `bucket` (`1m` \| `5m` \| `1h` \| `1d`) and optional `group_by` (`service` \| `level`).

Buckets are UTC-aligned, ordered by `start` ascending. Empty buckets are omitted. `group` is `null` when `group_by` is absent.

## Schema and index design

Table `logs`:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key, generated on insert |
| `timestamp` | `timestamptz` | Event time; used for range scans, pagination, aggregation, and retention |
| `level` | `log_level` enum | `debug`, `info`, `warn`, `error` |
| `service` | `text` | Exact-match filter |
| `message` | `text` | Substring search via `ILIKE` |
| `attributes` | `jsonb` | Flat key/value map, default `{}` |

Indexes:

- `logs_timestamp_id_idx` on `(timestamp DESC, id DESC)` — default listing, cursor pagination, time-range aggregation, retention deletes
- `logs_service_timestamp_idx` on `(service, timestamp DESC)` — the common `service` + time filter

A GIN index on `attributes` was omitted to keep ingest writes cheap. Attribute filters use parameterized `attributes ->> key = value` so values compare as text, matching the contract.

## Attribute storage strategy

Attributes stay in a single `jsonb` column. That keeps ingest as one row per log (no EAV join) and supports arbitrary keys without schema changes.

Trade-off: equality on unknown keys cannot use a btree. The load-generator filters are expected to always include a time range (and often `service`), which the btree indexes cover. Values are stored with their original JSON types (string, number, boolean); query comparison still uses `->>` so `attr.retries=3` matches numeric `3`.

## Retention strategy

Logs older than `RETENTION_DAYS` (default **30**) are deleted in the background.

- Interval: `RETENTION_INTERVAL_MS` (default 60s)
- Batch size: `RETENTION_BATCH_SIZE` (default 5000)

Each pass deletes by primary key from a `LIMIT`ed subquery so a pass cannot lock the whole table. Load-test data is recent, so default retention does not affect the generator.

## Measured performance results

Not yet measured against the shared load generator. Target environment and method:

- **Environment:** Compose limits — app 0.5 CPU / 256 MB, Postgres 1 CPU / 1 GB
- **Dataset:** ~1,000,000 rows over ~one month
- **Method:** submit the service at https://loadgen.foothilltech.net/ and record ingest rate, aggregation p95, and error rate

Baseline targets from the spec: ≥ 15,000 logs/s, aggregation p95 < 1s, newly ingested rows queryable within 20s.

## Known limitations

- `q` uses `ILIKE`, which will not use the btree indexes (acceptable for optional substring filters).
- Attribute filters are not index-backed.
- Empty aggregation buckets are omitted (allowed by the contract).
- Authentication, rate limiting, and multi-tenancy are not implemented.

## Optional features

None. Auth, API keys, tenancy, and rate limits are off.

`docker compose up` with no extra configuration serves `GET /health`, `POST /logs`, `GET /logs`, and `GET /logs/aggregate` without credentials.

| Variable | Default | Meaning |
| --- | --- | --- |
| `DB_URL` | set in Compose | Postgres connection string |
| `RETENTION_DAYS` | `30` | Age after which logs are deleted |
| `RETENTION_INTERVAL_MS` | `60000` | Retention worker period |
| `RETENTION_BATCH_SIZE` | `5000` | Rows deleted per batch |

`AUTH_ENABLED` is not read. An `Authorization` header is ignored.

## CI

GitHub Actions builds the project, runs unit tests, starts Compose, waits for `/health`, then runs `scripts/smoke.sh` (unauthenticated contract). Because no optional auth is implemented, that is the only required configuration.
