import { Mastra } from "@mastra/core";
import { PostgresStore } from "@mastra/pg";
import { assistant } from "./agents/assistant";

/**
 * Postgres is the single source of truth for everything Mastra needs to
 * persist: conversation threads, messages, and the observational-memory log.
 * Mastra creates its tables automatically on first use.
 *
 * DATABASE_URL points at the `db` service in docker-compose locally, or at a
 * managed Postgres instance in production (e.g. Railway Postgres).
 *
 * Mastra auto-generates the Telegram webhook at:
 *   /api/agents/assistant/channels/telegram/webhook
 */
export const mastra = new Mastra({
  agents: { assistant },
  storage: new PostgresStore({
    id: "mastra-storage",
    connectionString: process.env.DATABASE_URL!,
  }),
});
