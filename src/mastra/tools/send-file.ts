import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { sendDocumentToTelegram } from "./telegram-send";

/**
 * Generates a text-based file and sends it to the user as a Telegram document.
 */
export const sendFile = createTool({
  id: "send_file",
  description:
    "Generate a text-based file (e.g. .txt, .md, .csv, .json, code) and send it to the user as a document in the chat. Use when the user asks for a file, export, list, or downloadable text output. For a formatted PDF, use send_pdf instead. Provide the complete file contents and a filename with extension.",
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
    await sendDocumentToTelegram(context.agent?.threadId, {
      filename,
      bytes: content,
      contentType: "text/plain",
      caption,
    });
    return { sent: true };
  },
});
