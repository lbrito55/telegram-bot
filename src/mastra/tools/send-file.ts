import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const TELEGRAM_API = "https://api.telegram.org";

/**
 * Generates a text-based file and sends it to the user as a Telegram document.
 *
 * Mastra Channels routes tool *output* back through the agent's text reply, so a
 * tool can't post an attachment through the channel directly. Instead this tool
 * reaches the Telegram Bot API (`sendDocument`) itself, deriving the chat id from
 * the agent's thread context. Telegram thread ids look like:
 *   "telegram:<chatId>" or "telegram:<chatId>:<messageThreadId>"
 */
export const sendFile = createTool({
  id: "send_file",
  description:
    "Generate a text-based file (e.g. .txt, .md, .csv, .json, code) and send it to the user as a document in the chat. Use when the user asks for a file, export, document, list, or downloadable output. Provide the complete file contents and a filename with extension.",
  inputSchema: z.object({
    filename: z
      .string()
      .describe("File name with extension, e.g. notas.md, datos.csv, script.py"),
    content: z.string().describe("The complete text content of the file"),
    caption: z
      .string()
      .optional()
      .describe("Optional short caption sent with the file, in Spanish"),
  }),
  outputSchema: z.object({
    sent: z.boolean(),
  }),
  execute: async ({ filename, content, caption }, context) => {
    const threadId = context.agent?.threadId;
    if (!threadId) {
      throw new Error("No hay contexto de conversación para enviar el archivo.");
    }

    const [, chatId, messageThreadId] = threadId.split(":");
    if (!chatId) {
      throw new Error(`No se pudo obtener el chat del hilo "${threadId}".`);
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error("TELEGRAM_BOT_TOKEN no está configurado.");
    }

    const form = new FormData();
    form.append("chat_id", chatId);
    if (messageThreadId) form.append("message_thread_id", messageThreadId);
    if (caption) form.append("caption", caption);
    form.append("document", new Blob([content], { type: "text/plain" }), filename);

    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendDocument`, {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Telegram sendDocument falló: ${res.status} ${detail}`);
    }

    return { sent: true };
  },
});
