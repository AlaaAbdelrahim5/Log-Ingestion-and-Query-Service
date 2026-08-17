import { AggregateQueryFilters, NewLog } from "../types.js";

export type RollupIncrement = {
  bucketStart: string;
  service: string;
  level: string;
  count: number;
};

export function canUseRollups(filters: AggregateQueryFilters): boolean {
  return filters.q === undefined && Object.keys(filters.attributes).length === 0;
}

export function secondBucketIso(timestamp: string): string {
  const ms = Date.parse(timestamp);
  return new Date(Math.floor(ms / 1000) * 1000).toISOString();
}

export function buildRollupIncrements(entries: NewLog[]): RollupIncrement[] {
  const map = new Map<string, RollupIncrement>();

  for (const entry of entries) {
    const bucketStart = secondBucketIso(entry.timestamp);
    const key = `${bucketStart}\0${entry.service}\0${entry.level}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(key, {
        bucketStart,
        service: entry.service,
        level: entry.level,
        count: 1,
      });
    }
  }

  return [...map.values()];
}
