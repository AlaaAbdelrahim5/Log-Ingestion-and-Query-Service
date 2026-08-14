ALTER TABLE "logs" ALTER COLUMN "timestamp" SET DATA TYPE timestamp with time zone USING "timestamp" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "logs" ALTER COLUMN "timestamp" DROP DEFAULT;--> statement-breakpoint
UPDATE "logs" SET "attributes" = '{}'::jsonb WHERE "attributes" IS NULL;--> statement-breakpoint
ALTER TABLE "logs" ALTER COLUMN "attributes" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "logs" ALTER COLUMN "attributes" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "logs_timestamp_id_idx" ON "logs" USING btree ("timestamp" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "logs_service_timestamp_idx" ON "logs" USING btree ("service","timestamp" DESC NULLS LAST);