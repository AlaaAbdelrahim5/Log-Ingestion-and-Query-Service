import { config } from "../config.js";
import { deleteExpiredLogs } from "../db/queries/logs.js";

export function startRetentionWorker(): void {
  const tick = async () => {
    try {
      await runRetentionPass();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const cause =
        err instanceof Error && err.cause instanceof Error
          ? err.cause.message
          : "";
      console.error(
        `Retention pass failed: ${message}${cause ? ` (${cause})` : ""}`,
      );
    }
  };

  void tick();
  setInterval(tick, config.retention.intervalMs);
}

export async function runRetentionPass(): Promise<void> {
  const cutoff = new Date(
    Date.now() - config.retention.days * 24 * 60 * 60 * 1000,
  );

  let deleted = 0;
  do {
    deleted = await deleteExpiredLogs(cutoff, config.retention.batchSize);
  } while (deleted >= config.retention.batchSize);
}