import { MigrationConfig } from "drizzle-orm/migrator";
import { Request, Response, NextFunction } from "express";

export type Middleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => void;

export type APIConfig = {
  // fileserverHits: number;
  platform: string;
  // jwtSecret: string;
  // polkaKey: string;
};

export type DBConfig = {
  url: string;
  migrationConfig: MigrationConfig;
};

export type Config = {
  api: APIConfig;
  db: DBConfig;
};
