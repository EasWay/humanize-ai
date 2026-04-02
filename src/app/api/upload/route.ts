// POST /api/upload — Extract structured content from uploaded files (txt, pdf, docx)
import { NextRequest, NextResponse } from "next/server";

// HTML entity decoder helper
function decodeHtmlEntities(str: string): string {
  const entities: Record<string, string> = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": String.fromCharCode(34),
    "&#39;": String.fromCharCode(39),
    "&mdash;": "\u2014",
    "&ndash;": "\u2013",
    "&hellip;": "\u2026",
  };
  let result = str;
  for (const [entity, char] of Object.entries(entities)) {
    result = result.split(entity).join(char);
  }
  return result;
}

// Strip HTML tags and decode entities
function stripHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?[^>]+>/g, "")
  ).replace(/\s+/g, " ").trim();
}

// Parse a single HTML table into rows of cells
function parseTable(tableHtml: string): string[][] {
  const rows: string[][] = [];
  const trRegex = /<tr(?:\s[^>]*)?>([\s\S]*?)<\/tr>/gi;
  let trMatch;

  while ((trMatch = trRegex.exec(tableHtml)) !== null) {
    const rowHtml = trMatch[1];
    const cells: string[] = [];
    const cellRegex = /<(td|th)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
    let cellMatch;

    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      const text = stripHtml(cellMatch[2]);
      if (text) cells.push(text);
    }

    if (cells.length > 0) rows.push(cells);
  }

  return rows;
}

// Extract structured content from .docx via mammoth HTML output
async function extractDocxStructure(buffer: Buffer) {
  const mammoth = await import("mammoth");

  // Get HTML output to preserve formatting
  const htmlResult = await mammoth.convertToHtml({ buffer }, {
    convertImage: mammoth.images.dataUri,
  });

  // Get plain text as fallback
  const textResult = await mammoth.extractRawText({ buffer });

  const html = htmlResult.value;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: Array<Record<string, any>> = [];

  // First, extract and replace tables with placeholders so we process them as units
  const tableRegex = /<table(?:\s[^>]*)?>([\s\S]*?)<\/table>/gi;
  let processedHtml = html;
  const tables: string[][][] = [];

  processedHtml = html.replace(tableRegex, (_match, tableContent) => {
    const rows = parseTable(`<table>${tableContent}</table>`);
    if (rows.length > 0) {
      const idx = tables.length;
      tables.push(rows);
      return `\n%%TABLE_${idx}%%\n`;
    }
    return "";
  });

  // Now parse the remaining HTML blocks (headings, paragraphs, lists, etc.)
  const blockRegex = /<(h[1-6]|p|li|blockquote)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let match;
  let lastIndex = 0;
  const rawParts: Array<{ index: number; type: string; text: string; level?: number }> = [];

  while ((match = blockRegex.exec(processedHtml)) !== null) {
    // Check for table placeholders before this block
    const between = processedHtml.slice(lastIndex, match.index);
    const tableMatch = between.match(/%%TABLE_(\d+)%%/);
    if (tableMatch) {
      rawParts.push({ index: match.index - 1, type: "__table__", text: tableMatch[1] });
    }

    const tag = match[1].toLowerCase();
    const text = stripHtml(match[2]);
    if (!text) { lastIndex = match.index + match[0].length; continue; }

    if (tag.match(/^h[1-6]$/)) {
      rawParts.push({ index: match.index, type: "heading", text, level: parseInt(tag[1]) });
    } else if (tag === "li") {
      rawParts.push({ index: match.index, type: "list-item", text });
    } else if (tag === "blockquote") {
      rawParts.push({ index: match.index, type: "blockquote", text });
    } else {
      rawParts.push({ index: match.index, type: "paragraph", text });
    }

    lastIndex = match.index + match[0].length;
  }

  // Check for trailing table placeholder
  const trailing = processedHtml.slice(lastIndex);
  const trailingTable = trailing.match(/%%TABLE_(\d+)%%/);
  if (trailingTable) {
    rawParts.push({ index: lastIndex, type: "__table__", text: trailingTable[1] });
  }

  // Build final blocks list in order
  rawParts.sort((a, b) => a.index - b.index);
  for (const part of rawParts) {
    if (part.type === "__table__") {
      const tableIdx = parseInt(part.text);
      if (tables[tableIdx]) {
        blocks.push({ type: "table", rows: tables[tableIdx] });
      }
    } else {
      blocks.push({ type: part.type, text: part.text, ...(part.level ? { level: part.level } : {}) });
    }
  }

  // If no blocks found, fall back to plain text
  if (blocks.length === 0) {
    const plainLines = textResult.value.split("\n").filter(l => l.trim());
    for (const line of plainLines) {
      blocks.push({ type: "paragraph", text: line.trim() });
    }
  }

  return {
    blocks,
    plainText: textResult.value,
    html: htmlResult.value,
    warnings: htmlResult.messages,
  };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const fileSize = file.size;
    let format: "txt" | "pdf" | "docx" = "txt";
    let structure: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      blocks: Array<Record<string, any>>;
      plainText: string;
      html: string;
      warnings: unknown[];
    } | null = null;

    if (fileName.endsWith(".txt")) {
      format = "txt";
      const text = await file.text();
      structure = {
        blocks: text.split("\n").filter(l => l.trim()).map(line => ({ type: "paragraph", text: line.trim() })),
        plainText: text,
        html: "",
        warnings: [],
      };
    } else if (fileName.endsWith(".pdf")) {
      format = "pdf";
      const buffer = Buffer.from(await file.arrayBuffer());
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      const text = result.text || "";
      await parser.destroy();
      structure = {
        blocks: text.split("\n").filter(l => l.trim()).map(line => ({ type: "paragraph", text: line.trim() })),
        plainText: text,
        html: "",
        warnings: [],
      };
    } else if (fileName.endsWith(".docx")) {
      format = "docx";
      const buffer = Buffer.from(await file.arrayBuffer());
      structure = await extractDocxStructure(buffer);
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Use .txt, .pdf, or .docx" },
        { status: 400 }
      );
    }

    if (!structure || !structure.plainText.trim()) {
      return NextResponse.json({ error: "No text extracted from file" }, { status: 400 });
    }

    return NextResponse.json({
      text: structure.plainText.trim(),
      blocks: structure.blocks,
      format,
      fileName: file.name,
      fileSize,
      charCount: structure.plainText.length,
      wordCount: structure.plainText.split(/\s+/).filter((w: string) => w.length > 0).length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Upload error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
