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
- Only update your working memory when the user shares NEW, lasting personal facts (name, job, city, family, ongoing projects, strong preferences). Do NOT update it for small talk, questions, or things already saved. Most messages need no memory update at all.
- Never mention, narrate, or show your memory updates or any internal tools to the user. Just reply naturally as if you simply remember.`,

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
      // Persistent structured profile, updated only when new durable facts appear
      workingMemory: {
        enabled: true,
        template: `# Perfil de Max

## Datos básicos
- Nombre: Max
- Idioma preferido: Español

## Trabajo y proyectos

## Intereses y hobbies

## Familia y entorno

## Preferencias y estilo

## Notas del asistente
`,
      },
    },
  }),
});
