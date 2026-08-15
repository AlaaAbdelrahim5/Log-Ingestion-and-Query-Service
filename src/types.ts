export type NewLog = {
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  service: string;
  message: string;
  attributesJson: string;
};

export type RejectedEntry = {
  index: number;
  reason: string;
};

export type IngestResult = {
  accepted: number;
  rejected: RejectedEntry[];
};

export type LogQueryFilters = {
  service?: string;
  level?: string;
  since?: Date;
  until?: Date;
  attributes: Record<string, string>;
  q?: string;
  limit: number;
  cursor?: {
    timestamp: Date;
    id: string;
  };
};

export type LogRow = {
  id: string;
  timestamp: Date;
  level: string;
  service: string;
  message: string;
  attributes: Record<string, string | number | boolean> | null;
};

export type LogResponse = {
  id: string;
  timestamp: string;
  level: string;
  service: string;
  message: string;
  attributes: Record<string, string | number | boolean>;
};

export type QueryLogsResult = {
  logs: LogResponse[];
  next_cursor: string | null;
};

export type BucketSize = "1m" | "5m" | "1h" | "1d";
export type GroupBy = "service" | "level";

export type AggregateQueryFilters = {
  service?: string;
  level?: string;
  since: Date;
  until: Date;
  attributes: Record<string, string>;
  q?: string;
  bucket: BucketSize;
  groupBy?: GroupBy;
};

export type AggregateBucket = {
  start: string;
  group: string | null;
  count: number;
};

export type AggregateLogsResult = {
  buckets: AggregateBucket[];
};
