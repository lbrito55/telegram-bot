import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { createTelegramAdapter } from "@chat-adapter/telegram";

export const assistant = new Agent({
  id: "assistant",
  name: "Maximo",

  instructions: `You are a helpful personal assistant that talks to people over Telegram.

- Always respond in Spanish unless explicitly asked not to.
- Keep replies short and easy to read on a phone.
- Be warm and direct. If you don't know something, say so plainly.
- You remember earlier messages in this conversation, so don't ask people to repeat themselves.
- As you learn things about the user, update your memory so you can personalize future responses.`,

  model: process.env.MODEL ?? "openai/gpt-5.4-mini",

  channels: {
    adapters: {
      telegram: createTelegramAdapter(),
    },
  },

  memory: new Memory({
    options: {
      // Compresses old messages into dense observation logs in Postgres
      observationalMemory: true,
      // Persistent structured profile the agent reads and updates every turn
      workingMemory: {
        enabled: true,
        template: `# Perfil de Max

## Datos básicos
- Nombre: Max
- Idioma preferido: Español

## Trabajo y proyectos
(sin datos aún)

## Intereses y hobbies
(sin datos aún)

## Familia y entorno
(sin datos aún)

## Preferencias y estilo
(sin datos aún)

## Notas del asistente
(sin datos aún)
`,
      },
    },
  }),
});
