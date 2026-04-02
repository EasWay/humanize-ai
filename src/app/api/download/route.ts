// POST /api/download — Generate professionally formatted academic documents
import { NextRequest, NextResponse } from "next/server";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  PageNumber, Footer, UnderlineType, ShadingType, WidthType,
  Table, TableRow, TableCell, BorderStyle
} from "docx";

const INCH = 1440;
const HALF_INCH = 720;
const FONT = "Times New Roman";
const BODY_SIZE = 24; // 12pt
const HEADING1_SIZE = 32; // 16pt
const HEADING2_SIZE = 28; // 14pt
const HEADING3_SIZE = 24; // 12pt
const TABLE_SIZE = 22; // 11pt

// ─── Heading detection fallback (for text without block metadata) ───────────

const ALL_CAPS_HEADING = /^[A-Z][A-Z\s\d.,:;-]+$/;
const CHAPTER_HEADING = /^(CHAPTER|APPENDIX|SECTION)\s+\d/i;

function detectHeadingLevel(line: string): number | null {
  const t = line.trim();
  if (t.length < 3 || t.length > 120) return null;
  if (CHAPTER_HEADING.test(t)) return 1;
  if (ALL_CAPS_HEADING.test(t) && t.length > 5 && t.length < 100) return 1;
  if (/^\d+\.\d+\.\d+\s/.test(t)) return 3;
  if (/^\d+\.\d+\s/.test(t)) return 2;
  if (/^\d+\.\s+[A-Z]/.test(t) && t.length < 100) return 2;
  return null;
}

function isBulletPoint(line: string): boolean {
  return /^[-•·▪◦●○■□]\s/.test(line.trim());
}

function isReferenceEntry(line: string): boolean {
  return /\(\d{4}\)/.test(line.trim()) && line.trim().length > 40;
}

function isTableLine(line: string): boolean {
  const t = line.trim();
  return t.includes("|") && t.split("|").length > 2;
}

// ─── Inline formatting parser ───────────────────────────────────────────────

function createRuns(text: string, size = BODY_SIZE, bold = false, italic = false): TextRun[] {
  const runs: TextRun[] = [];
  // Handle **bold**, *italic*, _underline_
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("**") && part.endsWith("**")) {
      runs.push(new TextRun({ text: part.slice(2, -2), font: FONT, size, bold: true, italics: italic }));
    } else if (part.startsWith("*") && part.endsWith("*")) {
      runs.push(new TextRun({ text: part.slice(1, -1), font: FONT, size, bold, italics: true }));
    } else if (part.startsWith("_") && part.endsWith("_")) {
      runs.push(new TextRun({ text: part.slice(1, -1), font: FONT, size, bold, italics: italic, underline: { type: UnderlineType.SINGLE } }));
    } else {
      runs.push(new TextRun({ text: part, font: FONT, size, bold, italics: italic }));
    }
  }
  return runs.length > 0 ? runs : [new TextRun({ text, font: FONT, size, bold, italics: italic })];
}

// ─── Build paragraphs from blocks (original document structure) ─────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildFromBlocks(rewrittenText: string, blocks: Array<any>): Paragraph[] {
  // Split rewritten text into paragraphs to get the rewritten text per block
  const rewrittenParas = rewrittenText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const paragraphs: Paragraph[] = [];
  
  // Map blocks to rewritten paragraphs
  // Strategy: match by position — first N blocks map to first N paragraphs
  let textIdx = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    // Get corresponding rewritten paragraph
    let rewritten = textIdx < rewrittenParas.length ? rewrittenParas[textIdx] : block.text;

    if (block.type === "heading") {
      textIdx++;
      const level = block.level || 1;
      let headingLevel: (typeof HeadingLevel)[keyof typeof HeadingLevel];
      let fontSize: number;
      if (level === 1) {
        headingLevel = HeadingLevel.HEADING_1;
        fontSize = HEADING1_SIZE;
      } else if (level === 2) {
        headingLevel = HeadingLevel.HEADING_2;
        fontSize = HEADING2_SIZE;
      } else {
        headingLevel = HeadingLevel.HEADING_3;
        fontSize = HEADING3_SIZE;
      }

      paragraphs.push(new Paragraph({
        heading: headingLevel,
        spacing: {
          before: level === 1 ? 480 : level === 2 ? 280 : 240,
          after: level === 1 ? 240 : level === 2 ? 160 : 120,
        },
        children: [new TextRun({ text: rewritten, font: FONT, size: fontSize, bold: true, italics: level >= 3 })],
      }));
    } else if (block.type === "table" && Array.isArray(block.rows)) {
      // Structured table — render directly, not through rewritten text
      paragraphs.push(...buildTable(block.rows));
    } else if (block.type === "list-item") {
      textIdx++;
      paragraphs.push(new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 60 },
        indent: { left: HALF_INCH, hanging: HALF_INCH / 2 },
        children: createRuns(rewritten, BODY_SIZE),
      }));
    } else if (block.type === "blockquote") {
      textIdx++;
      paragraphs.push(new Paragraph({
        indent: { left: INCH },
        spacing: { after: 120 },
        children: createRuns(rewritten, BODY_SIZE, false, true),
      }));
    } else {
      // Regular paragraph
      textIdx++;
      paragraphs.push(new Paragraph({
        spacing: {
          after: 120,
          line: 360,
        },
        indent: { firstLine: HALF_INCH },
        children: createRuns(rewritten, BODY_SIZE),
      }));
    }
  }

  return paragraphs;
}

// ─── Build paragraphs from plain text (detection fallback) ──────────────────

function buildFromText(text: string): Paragraph[] {
  const lines = text.split("\n");
  const paragraphs: Paragraph[] = [];
  let inReferences = false;
  let tableRows: string[][] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (tableRows.length > 0) {
        paragraphs.push(...buildTable(tableRows));
        tableRows = [];
      }
      continue;
    }

    // References section
    if (/^REFERENCES?\s*$/i.test(trimmed)) {
      inReferences = true;
      paragraphs.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 480, after: 240 },
        children: [new TextRun({ text: "REFERENCES", font: FONT, size: HEADING1_SIZE, bold: true })],
      }));
      continue;
    }

    // Chapter headings
    if (CHAPTER_HEADING.test(trimmed)) {
      paragraphs.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 480, after: 240 },
        children: [new TextRun({ text: trimmed, font: FONT, size: HEADING1_SIZE, bold: true })],
      }));
      continue;
    }

    // Detected heading levels
    const hlvl = detectHeadingLevel(trimmed);
    if (hlvl) {
      paragraphs.push(new Paragraph({
        heading: hlvl === 1 ? HeadingLevel.HEADING_1 : hlvl === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
        spacing: { before: hlvl === 1 ? 480 : hlvl === 2 ? 280 : 240, after: hlvl === 1 ? 240 : hlvl === 2 ? 160 : 120 },
        children: [new TextRun({
          text: trimmed,
          font: FONT,
          size: hlvl === 1 ? HEADING1_SIZE : hlvl === 2 ? HEADING2_SIZE : HEADING3_SIZE,
          bold: true,
          italics: hlvl >= 3,
        })],
      }));
      continue;
    }

    // Tables
    if (isTableLine(trimmed)) {
      const cells = trimmed.split("|").map(c => c.trim()).filter(c => c);
      tableRows.push(cells);
      continue;
    }
    if (tableRows.length > 0) {
      paragraphs.push(...buildTable(tableRows));
      tableRows = [];
    }

    // Bullets
    if (isBulletPoint(trimmed)) {
      const content = trimmed.replace(/^[-•·▪◦●○■□]\s*/, "");
      paragraphs.push(new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 60 },
        indent: { left: HALF_INCH, hanging: HALF_INCH / 2 },
        children: createRuns(content, BODY_SIZE),
      }));
      continue;
    }

    // References (hanging indent)
    if (inReferences && isReferenceEntry(trimmed)) {
      paragraphs.push(new Paragraph({
        spacing: { after: 120 },
        indent: { left: HALF_INCH, hanging: HALF_INCH },
        children: createRuns(trimmed, BODY_SIZE),
      }));
      continue;
    }

    // Regular paragraph
    paragraphs.push(new Paragraph({
      spacing: { after: 120, line: 360 },
      indent: { firstLine: HALF_INCH },
      children: createRuns(trimmed, BODY_SIZE),
    }));
  }

  if (tableRows.length > 0) {
    paragraphs.push(...buildTable(tableRows));
  }

  return paragraphs;
}

// ─── Table builder ──────────────────────────────────────────────────────────

function buildTable(rows: string[][]): Paragraph[] {
  if (rows.length === 0) return [];

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((row, ri) => new TableRow({
      children: row.map(cell => new TableCell({
        width: { size: Math.floor(100 / row.length), type: WidthType.PERCENTAGE },
        shading: ri === 0 ? { type: ShadingType.SOLID, color: "2B5797" } : undefined,
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
          left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
          right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
        },
        children: [new Paragraph({
          spacing: { before: 40, after: 40 },
          children: [new TextRun({
            text: cell,
            font: FONT,
            size: TABLE_SIZE,
            bold: ri === 0,
            color: ri === 0 ? "FFFFFF" : "000000",
          })],
        })],
      })),
    })),
  });

  return [table as unknown as Paragraph];
}

// ─── Page footer with page numbers ──────────────────────────────────────────

function createFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 240 },
        children: [
          new TextRun({ text: "Page ", font: FONT, size: 20, color: "666666" }),
          new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 20, color: "666666" }),
        ],
      }),
    ],
  });
}

// ─── Main handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, format, fileName, blocks = [] } = body;

    if (!text) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    if (format === "docx") {
      // V2 pipeline — structure-preserving rewrite using original XML
      const { docxJobId, docxV2 } = body;
      if (docxV2 && docxJobId) {
        const { getDocxBuffer, renderDocx, processDocument } = await import("@/lib/docx");
        const stored = getDocxBuffer(docxJobId);
        if (stored) {
          const { ast } = stored as { ast: import("@/lib/docx").DocxDocument; buffer: Buffer };
          const rewritten = await processDocument(ast);
          const buffer = await renderDocx(rewritten);
          const baseName = fileName || "document";
          return new NextResponse(new Uint8Array(buffer), {
            headers: {
              "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              "Content-Disposition": `attachment; filename="${baseName}"`,
            },
          });
        }
      }

      // V1 pipeline — fallback (existing logic)
      // Use blocks if available (from original .docx), otherwise detect from text
      const docParagraphs = blocks.length > 0
        ? buildFromBlocks(text, blocks)
        : buildFromText(text);

      const doc = new Document({
        styles: {
          default: {
            document: {
              run: { font: FONT, size: BODY_SIZE },
              paragraph: { spacing: { line: 360 } },
            },
            heading1: {
              run: { font: FONT, size: HEADING1_SIZE, bold: true, color: "1A1A1A" },
              paragraph: { spacing: { before: 480, after: 240 } },
            },
            heading2: {
              run: { font: FONT, size: HEADING2_SIZE, bold: true, color: "1A1A1A" },
              paragraph: { spacing: { before: 280, after: 160 } },
            },
            heading3: {
              run: { font: FONT, size: HEADING3_SIZE, bold: true, italics: true, color: "1A1A1A" },
              paragraph: { spacing: { before: 240, after: 120 } },
            },
          },
        },
        sections: [{
          properties: {
            page: {
              size: { width: 12240, height: 15840 },
              margin: { top: INCH, right: INCH, bottom: INCH, left: INCH },
            },
          },
          footers: { default: createFooter() },
          children: docParagraphs,
        }],
      });

      const buffer = await Packer.toBuffer(doc);
      const baseName = fileName || "document";

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${baseName}"`,
        },
      });
    }

    // Plain text download
    const baseName = fileName || "document";
    return new NextResponse(text, {
      headers: {
        "Content-Type": "text/plain",
        "Content-Disposition": `attachment; filename="${baseName}"`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
