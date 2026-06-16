/**
 * Pushes a document to Telegram out-of-band.
 *
 * Mastra Channels routes a tool's return value back through the agent's text
 * reply, so a tool cannot emit an attachment through the channel. Instead we
 * call the Telegram Bot API (`sendDocument`) directly, deriving the chat id from
 * the agent's thread context. Telegram thread ids look like:
 *   "telegram:<chatId>" or "telegram:<chatId>:<messageThreadId>"
 */
export async function sendDocumentToTelegram(
  threadId: string | undefined,
  doc: {
    filename: string;
    bytes: Uint8Array | string;
    contentType: string;
    caption?: string;
  },
): Promise<void> {
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
  if (doc.caption) form.append("caption", doc.caption);
  form.append(
    "document",
    new Blob([doc.bytes], { type: doc.contentType }),
    doc.filename,
  );

  const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Telegram sendDocument falló: ${res.status} ${detail}`);
  }
}
