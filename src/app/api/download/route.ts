// POST /api/download — Generate downloadable file from humanized text
import { NextRequest, NextResponse } from "next/server";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, format, fileName } = body;

    if (!text) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    if (format === "docx") {
      // Convert text to docx with basic structure
      const paragraphs = text.split(/\n\s*\n/).filter((p: string) => p.trim());
      const docParagraphs = paragraphs.map((para: string) => {
        const trimmed = para.trim();
        // Detect headings (ALL CAPS or short lines)
        const isHeading = trimmed.length < 80 && trimmed === trimmed.toUpperCase() && trimmed.length > 5;
        const isSubHeading = trimmed.length < 100 && /^\d+\.?\s/.test(trimmed);

        if (isHeading) {
          return new Paragraph({
            text: trimmed,
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 240, after: 120 },
          });
        }
        if (isSubHeading) {
          return new Paragraph({
            text: trimmed,
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 },
          });
        }

        return new Paragraph({
          children: [new TextRun({ text: trimmed, size: 24 })],
          spacing: { after: 120 },
        });
      });

      const doc = new Document({
        sections: [{
          properties: {},
          children: docParagraphs,
        }],
      });

      const buffer = await Packer.toBuffer(doc);
      const baseName = fileName ? fileName.replace(/\.[^.]+$/, "") : "humanized";

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${baseName}_humanized.docx"`,
        },
      });
    }

    // Default: txt download
    const baseName = fileName ? fileName.replace(/\.[^.]+$/, "") : "humanized";
    return new NextResponse(text, {
      headers: {
        "Content-Type": "text/plain",
        "Content-Disposition": `attachment; filename="${baseName}_humanized.txt"`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
