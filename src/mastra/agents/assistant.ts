import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { createTelegramAdapter } from "@chat-adapter/telegram";

/**
 * The entire bot is this one agent.
 *
 * - `channels` wires Telegram directly to the agent. Mastra receives each
 *   message on an auto-generated webhook, runs it through the agent, and
 *   streams the reply back. No bot library, no message handler.
 *
 * - `memory` uses observational memory: background agents compress old
 *   messages into a dense observation log so the context window stays small
 *   while long-term memory is preserved. Storage comes from the Mastra
 *   instance (Postgres) — see src/mastra/index.ts.
 *
 * No tools yet: a message goes to the agent, the LLM answers, the answer
 * goes back. That's it.
 */
export const assistant = new Agent({
  id: "assistant",
  name: "Assistant",
  instructions: `You are a helpful personal assistant that talks to people over Telegram.

- Keep replies short and easy to read on a phone.
- Be warm and direct. If you don't know something, say so plainly.
- You remember earlier messages in this conversation, so don't ask people to repeat themselves.`,

  // Mastra model router format: "provider/model-name".
  // Reads OPENAI_API_KEY from the environment for openai/* models.
  model: process.env.MODEL ?? "anthropic/claude-sonnet-4-6",

  channels: {
    adapters: {
      // Reads TELEGRAM_BOT_TOKEN from the environment by default.
      telegram: createTelegramAdapter(),
    },
  },

  // Inherits Postgres storage from the Mastra instance.
  memory: new Memory({
    options: {
      observationalMemory: true,
    },
  }),
});
