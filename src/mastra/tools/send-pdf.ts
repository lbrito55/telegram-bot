import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { sendDocumentToTelegram } from "./telegram-send";

// A4 in points.
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const MAX_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BODY_SIZE = 11;
const LINE_HEIGHT = 16;

/**
 * pdf-lib's standard fonts use WinAnsi encoding. Map common smart punctuation to
 * ASCII and drop anything outside Latin-1 (e.g. emoji) so encoding never throws.
 * Spanish accents (á, é, í, ó, ú, ñ, ü, ¿, ¡) are all within Latin-1 and survive.
 */
function sanitize(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x00-\xFF]/g, "");
}

function wrapLine(text: string, font: PDFFont, size: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, size) > MAX_WIDTH) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

async function buildPdf(title: string, body: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const draw = (text: string, f: PDFFont, size: number) => {
    if (y < MARGIN) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    page.drawText(text, { x: MARGIN, y, size, font: f, color: rgb(0, 0, 0) });
    y -= size === BODY_SIZE ? LINE_HEIGHT : size + 6;
  };

  if (title.trim()) {
    for (const line of wrapLine(sanitize(title), bold, 16)) draw(line, bold, 16);
    y -= 8;
  }

  for (const paragraph of sanitize(body).split(/\n/)) {
    if (paragraph.trim() === "") {
      y -= LINE_HEIGHT;
      continue;
    }
    for (const line of wrapLine(paragraph, font, BODY_SIZE)) {
      draw(line, font, BODY_SIZE);
    }
  }

  return pdf.save();
}

/**
 * Generates a formatted PDF from a title + text body and sends it to the user
 * as a Telegram document.
 */
export const sendPdf = createTool({
  id: "send_pdf",
  description:
    "Generate a formatted PDF document and send it to the user in the chat. Use when the user wants a PDF, a report, or a polished document. Provide a title and the full body text (plain text or simple line breaks; long lines wrap and content paginates automatically).",
  inputSchema: z.object({
    filename: z
      .string()
      .describe("File name ending in .pdf, e.g. resumen.pdf, informe.pdf"),
    title: z.string().describe("Document title shown at the top"),
    body: z
      .string()
      .describe("Full body text. Use line breaks for paragraphs."),
    caption: z
      .string()
      .optional()
      .describe("Optional short caption sent with the file, in Spanish"),
  }),
  outputSchema: z.object({
    sent: z.boolean(),
  }),
  execute: async ({ filename, title, body, caption }, context) => {
    const name = filename.toLowerCase().endsWith(".pdf")
      ? filename
      : `${filename}.pdf`;
    const bytes = await buildPdf(title, body);
    await sendDocumentToTelegram(context.agent?.threadId, {
      filename: name,
      bytes,
      contentType: "application/pdf",
      caption,
    });
    return { sent: true };
  },
});
