// POST /api/download — Generate professionally formatted academic documents
import { NextRequest, NextResponse } from "next/server";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  PageNumber, Footer, Header, TabStopType, TabStopPosition,
  UnderlineType, BorderStyle, SectionType, ShadingType, TableCell, Table, TableRow, WidthType
} from "docx";

const INCH = 1440; // 1 inch in twips
const HALF_INCH = 720;
const POINT = 2; // 1 point = 2 twips

// Academic style constants
const FONT = "Times New Roman";
const BODY_SIZE = 24; // 12pt
const HEADING1_SIZE = 32; // 16pt
const HEADING2_SIZE = 28; // 14pt
const HEADING3_SIZE = 24; // 12pt

// Heading detection patterns
const ALL_CAPS_HEADING = /^[A-Z][A-Z\s\d.,:;-]+$/;
const NUMBERED_HEADING = /^\d+(\.\d+)*\.?\s+[A-Z]/;
const CHAPTER_HEADING = /^(CHAPTER|APPENDIX|SECTION)\s+\d/i;

function isHeading1(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 120) return false;
  // CHAPTER X, APPENDIX X, or ALL CAPS short lines
  if (CHAPTER_HEADING.test(t)) return true;
  if (ALL_CAPS_HEADING.test(t) && t.length > 5 && t.length < 100) return true;
  return false;
}

function isHeading2(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 150) return false;
  // Pattern: "5.1 Introduction", "4.2.3 Detailed Analysis"
  if (/^\d+\.\d+(\.\d+)?\s/.test(t)) return true;
  // Pattern: "Figure 1:" or "Table 1:" or "Appendix A:"
  if (/^(Figure|Table|Appendix)\s+[A-Z0-9]/i.test(t)) return false;
  // Short numbered lines that look like headings
  if (/^\d+\.\s+[A-Z]/.test(t) && t.length < 100) return true;
  return false;
}

function isHeading3(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 200) return false;
  // Pattern: "5.2.1 Sub Topic"
  if (/^\d+\.\d+\.\d+\s/.test(t)) return true;
  return false;
}

function isTableHeader(line: string): boolean {
  const t = line.trim();
  // Tables with | separators or tab-separated data
  return t.includes("|") && t.split("|").length > 2;
}

function isBulletPoint(line: string): boolean {
  const t = line.trim();
  return /^[-•·▪◦●○■□]\s/.test(t) || /^[a-z]\)\s/.test(t);
}

function isNumberedList(line: string): boolean {
  const t = line.trim();
  return /^\d+[\.)]\s/.test(t) && !isHeading2(t);
}

function isReferenceEntry(line: string): boolean {
  const t = line.trim();
  // Reference entries typically have (Year) pattern and are longer
  return /\(\d{4}\)/.test(t) && t.length > 40;
}

function parseTable(line: string): { headers: string[]; rows: string[][] } | null {
  const t = line.trim();
  if (!t.includes("|")) return null;
  
  const cells = t.split("|").map(c => c.trim()).filter(c => c);
  // If it looks like a header row (bold-ish or title case)
  if (cells.every(c => c.length > 0)) {
    return { headers: cells, rows: [] };
  }
  return null;
}

function createTextRuns(text: string, size = BODY_SIZE, bold = false, italic = false, underline = false): TextRun[] {
  const runs: TextRun[] = [];
  // Simple inline formatting: **bold**, *italic*, _underline_
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g);
  
  for (const part of parts) {
    if (part.startsWith("**") && part.endsWith("**")) {
      runs.push(new TextRun({ text: part.slice(2, -2), font: FONT, size, bold: true, italics: italic, underline: underline ? { type: UnderlineType.SINGLE } : undefined }));
    } else if (part.startsWith("*") && part.endsWith("*")) {
      runs.push(new TextRun({ text: part.slice(1, -1), font: FONT, size, bold, italics: true, underline: underline ? { type: UnderlineType.SINGLE } : undefined }));
    } else if (part.startsWith("_") && part.endsWith("_")) {
      runs.push(new TextRun({ text: part.slice(1, -1), font: FONT, size, bold, italics: italic, underline: { type: UnderlineType.SINGLE } }));
    } else if (part) {
      runs.push(new TextRun({ text: part, font: FONT, size, bold, italics: italic, underline: underline ? { type: UnderlineType.SINGLE } : undefined }));
    }
  }
  
  return runs.length > 0 ? runs : [new TextRun({ text, font: FONT, size, bold, italics: italic, underline: underline ? { type: UnderlineType.SINGLE } : undefined })];
}

function buildParagraphs(text: string): Paragraph[] {
  const lines = text.split("\n");
  const paragraphs: Paragraph[] = [];
  let inReferences = false;
  let inTable = false;
  let tableRows: string[][] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Skip empty lines
    if (!trimmed) {
      if (inTable && tableRows.length > 0) {
        // Flush table
        paragraphs.push(...buildTableFromRows(tableRows));
        tableRows = [];
        inTable = false;
      }
      continue;
    }

    // Detect references section
    if (/^REFERENCES?\s*$/i.test(trimmed)) {
      inReferences = true;
      paragraphs.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 360, after: 200 },
        children: [new TextRun({ text: "REFERENCES", font: FONT, size: HEADING1_SIZE, bold: true })],
      }));
      continue;
    }

    // Chapter headings (CHAPTER 1, CHAPTER 2, etc.)
    if (CHAPTER_HEADING.test(trimmed)) {
      paragraphs.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 480, after: 240 },
        children: [new TextRun({ text: trimmed, font: FONT, size: HEADING1_SIZE, bold: true })],
      }));
      continue;
    }

    // Heading level 1 — ALL CAPS lines
    if (isHeading1(trimmed) && !CHAPTER_HEADING.test(trimmed)) {
      paragraphs.push(new Paragraph({
        spacing: { before: 360, after: 200 },
        children: [new TextRun({ text: trimmed, font: FONT, size: HEADING1_SIZE, bold: true })],
      }));
      continue;
    }

    // Heading level 2 — numbered headings like "5.1 Introduction"
    if (isHeading2(trimmed)) {
      paragraphs.push(new Paragraph({
        spacing: { before: 280, after: 160 },
        children: [new TextRun({ text: trimmed, font: FONT, size: HEADING2_SIZE, bold: true })],
      }));
      continue;
    }

    // Heading level 3 — deeper numbered headings
    if (isHeading3(trimmed)) {
      paragraphs.push(new Paragraph({
        spacing: { before: 240, after: 120 },
        children: [new TextRun({ text: trimmed, font: FONT, size: HEADING3_SIZE, bold: true, italics: true })],
      }));
      continue;
    }

    // Table detection
    if (isTableHeader(trimmed)) {
      inTable = true;
      const cells = trimmed.split("|").map(c => c.trim()).filter(c => c);
      tableRows.push(cells);
      continue;
    }

    if (inTable) {
      if (trimmed.includes("|")) {
        const cells = trimmed.split("|").map(c => c.trim()).filter(c => c);
        tableRows.push(cells);
        continue;
      } else {
        // End of table
        paragraphs.push(...buildTableFromRows(tableRows));
        tableRows = [];
        inTable = false;
        // Fall through to process this line normally
      }
    }

    // Bullet points
    if (isBulletPoint(trimmed)) {
      const content = trimmed.replace(/^[-•·▪◦●○■□]\s*/, "").replace(/^[a-z]\)\s*/, "");
      paragraphs.push(new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 60 },
        indent: { left: HALF_INCH, hanging: HALF_INCH / 2 },
        children: createTextRuns(content, BODY_SIZE),
      }));
      continue;
    }

    // Numbered list
    if (isNumberedList(trimmed) && !inReferences) {
      const match = trimmed.match(/^(\d+)[\.)]\s+(.*)/);
      if (match) {
        paragraphs.push(new Paragraph({
          spacing: { after: 60 },
          indent: { left: HALF_INCH, hanging: HALF_INCH / 2 },
          children: createTextRuns(match[2], BODY_SIZE),
        }));
        continue;
      }
    }

    // Reference entries — hanging indent style
    if (inReferences && isReferenceEntry(trimmed)) {
      paragraphs.push(new Paragraph({
        spacing: { after: 120 },
        indent: { left: HALF_INCH, hanging: HALF_INCH },
        children: createTextRuns(trimmed, BODY_SIZE),
      }));
      continue;
    }

    // Regular body paragraph — first line indent
    paragraphs.push(new Paragraph({
      spacing: {
        after: 120,
        line: 360, // 1.5 line spacing (240 = single, 480 = double)
      },
      indent: { firstLine: HALF_INCH },
      children: createTextRuns(trimmed, BODY_SIZE),
    }));
  }

  // Flush remaining table
  if (inTable && tableRows.length > 0) {
    paragraphs.push(...buildTableFromRows(tableRows));
  }

  return paragraphs;
}

function buildTableFromRows(rows: string[][]): Paragraph[] {
  if (rows.length === 0) return [];
  
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((row, rowIndex) => new TableRow({
      children: row.map(cell => new TableCell({
        width: { size: Math.floor(100 / row.length), type: WidthType.PERCENTAGE },
        shading: rowIndex === 0 ? { type: ShadingType.SOLID, color: "2B5797" } : undefined,
        children: [new Paragraph({
          children: [new TextRun({
            text: cell,
            font: FONT,
            size: BODY_SIZE - 2, // 11pt for tables
            bold: rowIndex === 0,
            color: rowIndex === 0 ? "FFFFFF" : "000000",
          })],
        })],
      })),
    })),
  });

  return [table as unknown as Paragraph];
}

function createFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 240 },
        children: [
          new TextRun({ text: "Page ", font: FONT, size: 20 }),
          new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 20 }),
        ],
      }),
    ],
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, format, fileName } = body;

    if (!text) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    if (format === "docx") {
      const docParagraphs = buildParagraphs(text);

      const doc = new Document({
        styles: {
          default: {
            document: {
              run: { font: FONT, size: BODY_SIZE },
              paragraph: {
                spacing: { line: 360 },
              },
            },
            heading1: {
              run: { font: FONT, size: HEADING1_SIZE, bold: true },
              paragraph: { spacing: { before: 360, after: 200 } },
            },
            heading2: {
              run: { font: FONT, size: HEADING2_SIZE, bold: true },
              paragraph: { spacing: { before: 280, after: 160 } },
            },
            heading3: {
              run: { font: FONT, size: HEADING3_SIZE, bold: true, italics: true },
              paragraph: { spacing: { before: 240, after: 120 } },
            },
          },
        },
        sections: [{
          properties: {
            page: {
              size: { width: 12240, height: 15840 }, // US Letter
              margin: {
                top: INCH,
                right: INCH,
                bottom: INCH,
                left: INCH,
              },
            },
          },
          footers: {
            default: createFooter(),
          },
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

    // Default: txt download
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
