/**
 * Pushes a document to Telegram out-of-band.
 *
 * Mastra Channels routes a tool's return value back through the agent's text
 * reply, so a tool cannot emit an attachment through the channel. Instead we
 * call the Telegram Bot API (`sendDocument`) directly, deriving the chat id from
 * the agent's thread context. Telegram thread ids look like:
 *   "telegram:<chatId>" or "telegram:<chatId>:<messageThreadId>"
 */

const TELEGRAM_THREAD_RE = /^telegram:-?\d+(?::\d+)?$/;

/** Bounded, cycle-safe scan for a "telegram:<chatId>" value anywhere in the context. */
function deepFindTelegramThread(
  obj: unknown,
  seen: Set<unknown> = new Set(),
  depth = 0,
): string | undefined {
  if (obj == null || depth > 5) return undefined;
  if (typeof obj === "string") {
    return TELEGRAM_THREAD_RE.test(obj) ? obj : undefined;
  }
  if (typeof obj !== "object") return undefined;
  if (seen.has(obj)) return undefined;
  seen.add(obj);

  if (obj instanceof Map) {
    for (const value of obj.values()) {
      const found = deepFindTelegramThread(value, seen, depth + 1);
      if (found) return found;
    }
    return undefined;
  }

  // Skip large framework objects that may have throwing getters or cycles.
  const SKIP = new Set([
    "mastra",
    "tracing",
    "tracingContext",
    "loggerVNext",
    "metrics",
    "abortSignal",
    "writer",
    "writableStream",
  ]);

  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (SKIP.has(key)) continue;
    try {
      const found = deepFindTelegramThread(
        (obj as Record<string, unknown>)[key],
        seen,
        depth + 1,
      );
      if (found) return found;
    } catch {
      // getters can throw — ignore and keep scanning
    }
  }
  return undefined;
}

/** Resolves the Telegram thread id ("telegram:<chatId>[:<topic>]") from a tool context. */
export function resolveTelegramThreadId(context: any): string | undefined {
  const candidates = [context?.agent?.threadId, context?.threadId];
  for (const c of candidates) {
    if (typeof c === "string" && c.startsWith("telegram:")) return c;
  }

  const rc = context?.runtimeContext;
  if (rc && typeof rc.get === "function") {
    const t = rc.get("threadId");
    if (typeof t === "string" && t.startsWith("telegram:")) return t;
  }

  const found = deepFindTelegramThread(context);
  if (!found) {
    // Telemetry only (Railway logs / Mastra Studio), never the chat.
    console.error("[telegram-send] could not resolve thread id", {
      contextKeys: context ? Object.keys(context) : null,
      agentKeys: context?.agent ? Object.keys(context.agent) : null,
      agentThreadId: context?.agent?.threadId ?? null,
      topThreadId: context?.threadId ?? null,
      hasRuntimeContext: Boolean(rc),
    });
  }
  return found;
}

export async function sendDocumentToTelegram(
  context: unknown,
  doc: {
    filename: string;
    bytes: Uint8Array | string;
    contentType: string;
    caption?: string;
  },
): Promise<void> {
  const threadId = resolveTelegramThreadId(context);
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
