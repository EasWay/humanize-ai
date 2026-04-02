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

// Extract structured content from .docx via mammoth HTML output
async function extractDocxStructure(buffer: Buffer) {
  const mammoth = await import("mammoth");

  // Get HTML output to preserve formatting
  const htmlResult = await mammoth.convertToHtml({ buffer }, {
    convertImage: mammoth.images.dataUri,
  });

  // Get plain text as fallback
  const textResult = await mammoth.extractRawText({ buffer });

  // Parse HTML to extract paragraphs with their types
  const html = htmlResult.value;
  const blocks: Array<{
    type: string;
    text: string;
    level?: number;
  }> = [];

  // Parse HTML blocks: h1-h6, p, table rows, li, etc.
  const blockRegex = /<(h[1-6]|p|table|tr|td|th|li|ol|ul|blockquote)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let match;

  while ((match = blockRegex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const innerHtml = match[2];

    // Strip HTML tags and decode entities
    const text = decodeHtmlEntities(
      innerHtml
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/?[^>]+>/g, "")
    ).replace(/\s+/g, " ").trim();

    if (!text) continue;

    if (tag.match(/^h[1-6]$/)) {
      const level = parseInt(tag[1]);
      blocks.push({ type: "heading", text, level });
    } else if (tag === "table" || tag === "tr" || tag === "td" || tag === "th") {
      blocks.push({ type: "table-cell", text });
    } else if (tag === "li") {
      blocks.push({ type: "list-item", text });
    } else if (tag === "blockquote") {
      blocks.push({ type: "blockquote", text });
    } else {
      blocks.push({ type: "paragraph", text });
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
      blocks: Array<{ type: string; text: string; level?: number }>;
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
