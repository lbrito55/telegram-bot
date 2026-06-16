import { Mastra } from "@mastra/core";
import { PostgresStore } from "@mastra/pg";
import { Observability, MastraStorageExporter } from "@mastra/observability";
import { assistant } from "./agents/assistant";

/**
 * Postgres is the single source of truth for everything Mastra needs to
 * persist: conversation threads, messages, working memory, and traces.
 * Mastra creates its tables automatically on first use.
 *
 * DATABASE_URL points at the `db` service in docker-compose locally, or at a
 * managed Postgres instance in production (e.g. Railway Postgres).
 *
 * Mastra auto-generates the Telegram webhook at:
 *   /api/agents/assistant/channels/telegram/webhook
 *
 * Observability traces every agent run — LLM calls, tool calls (web_search,
 * send_file, send_pdf, working-memory updates) — into Postgres, which powers
 * the Traces tab in Mastra Studio.
 */
export const mastra = new Mastra({
  agents: { assistant },
  storage: new PostgresStore({
    id: "mastra-storage",
    connectionString: process.env.DATABASE_URL!,
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: "maximo-telegram-bot",
        exporters: [new MastraStorageExporter()],
      },
    },
  }),
});
