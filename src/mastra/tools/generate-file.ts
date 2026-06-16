import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { sendDocumentToTelegram } from "./telegram-send";

const OPENAI_API = "https://api.openai.com/v1";

type FoundFile = { fileId: string; filename: string };

/**
 * Walks a Responses API result for the code-interpreter container id and any
 * cited generated files. Citations are unreliable (files in /mnt/data sometimes
 * aren't cited), so we also capture the container id from the code_interpreter_call
 * item and fall back to listing the container's files.
 */
function extractContainerFiles(run: any): {
  containerId?: string;
  citedFiles: FoundFile[];
} {
  let containerId: string | undefined;
  const citedFiles: FoundFile[] = [];
  const seen = new Set<string>();

  const output = Array.isArray(run?.output) ? run.output : [];
  for (const item of output) {
    if (item?.type === "code_interpreter_call" && item?.container_id) {
      containerId = item.container_id;
    }
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      const annotations = Array.isArray(part?.annotations)
        ? part.annotations
        : [];
      for (const ann of annotations) {
        if (ann?.type === "container_file_citation") {
          if (ann.container_id) containerId = ann.container_id;
          if (ann.file_id && !seen.has(ann.file_id)) {
            seen.add(ann.file_id);
            citedFiles.push({
              fileId: ann.file_id,
              filename: ann.filename ?? "archivo",
            });
          }
        }
      }
    }
  }
  return { containerId, citedFiles };
}

async function listContainerFiles(
  containerId: string,
  apiKey: string,
): Promise<FoundFile[]> {
  const res = await fetch(`${OPENAI_API}/containers/${containerId}/files`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as any;
  const data = Array.isArray(json?.data) ? json.data : [];
  return data
    // Keep files the model produced, not ones the user uploaded.
    .filter((f: any) => f?.id && f?.source !== "user")
    .map((f: any) => ({
      fileId: f.id,
      filename: f.path ? String(f.path).split("/").pop() : (f.filename ?? f.id),
    }));
}

async function downloadContainerFile(
  containerId: string,
  fileId: string,
  apiKey: string,
): Promise<Uint8Array> {
  const res = await fetch(
    `${OPENAI_API}/containers/${containerId}/files/${fileId}/content`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Descarga del archivo falló: ${res.status} ${detail}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

function guessContentType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    csv: "text/csv",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    json: "application/json",
    txt: "text/plain",
    md: "text/markdown",
    zip: "application/zip",
  };
  return map[ext] ?? "application/octet-stream";
}

/**
 * Generates any file via a dedicated OpenAI code-interpreter run, then forwards
 * the resulting file(s) to Telegram. The model writes and runs Python in an
 * OpenAI-hosted sandbox, so output quality is state-of-the-art (real PDFs,
 * spreadsheets, charts) — we only orchestrate retrieval and delivery.
 */
export const generateFile = createTool({
  id: "generate_file",
  description:
    "Generate ANY downloadable file for the user — PDF, Excel (xlsx), CSV, chart/plot (png), Word doc, code, data files — and send it to the chat. A code interpreter writes and runs Python to build the real file. Use for any file, document, report, export, chart, spreadsheet, or data request. Describe the desired content, format and extension in detail; that text is the brief for the code that builds the file.",
  inputSchema: z.object({
    instructions: z
      .string()
      .describe(
        "Detailed brief for the file: its purpose, exact content, desired format/extension, and any data or values. Be specific.",
      ),
    caption: z
      .string()
      .optional()
      .describe("Optional short caption sent with the file, in Spanish"),
  }),
  outputSchema: z.object({
    sent: z.boolean(),
    files: z.array(z.string()),
  }),
  execute: async ({ instructions, caption }, context) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY no está configurado.");

    const model =
      process.env.FILE_MODEL ??
      (process.env.MODEL ?? "gpt-5.4-mini").replace(/^openai\//, "");

    const runRes = await fetch(`${OPENAI_API}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        tools: [{ type: "code_interpreter", container: { type: "auto" } }],
        instructions:
          "You are a file generator. Use the code interpreter to create exactly the file(s) the user describes, saving each to /mnt/data with a clear, descriptive filename and correct extension. Produce real, valid files (e.g. reportlab or matplotlib for PDF, openpyxl for xlsx, matplotlib for png charts). After saving, state each filename. Do not ask clarifying questions — make reasonable assumptions.",
        input: instructions,
      }),
    });

    if (!runRes.ok) {
      const detail = await runRes.text();
      throw new Error(`OpenAI responses falló: ${runRes.status} ${detail}`);
    }

    const run = (await runRes.json()) as any;
    const { containerId, citedFiles } = extractContainerFiles(run);
    if (!containerId) {
      throw new Error("El generador no creó ningún contenedor de archivos.");
    }

    let files = citedFiles;
    if (files.length === 0) {
      files = await listContainerFiles(containerId, apiKey);
    }
    if (files.length === 0) {
      throw new Error("El generador no produjo archivos descargables.");
    }

    const sentNames: string[] = [];
    for (const file of files) {
      const bytes = await downloadContainerFile(
        containerId,
        file.fileId,
        apiKey,
      );
      await sendDocumentToTelegram(context, {
        filename: file.filename,
        bytes,
        contentType: guessContentType(file.filename),
        caption: sentNames.length === 0 ? caption : undefined,
      });
      sentNames.push(file.filename);
    }

    return { sent: true, files: sentNames };
  },
});
