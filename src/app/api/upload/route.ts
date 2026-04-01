// POST /api/upload — Extract text from uploaded files (txt, pdf, docx)
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const fileSize = file.size;
    let text = "";
    let format: "txt" | "pdf" | "docx" = "txt";

    if (fileName.endsWith(".txt")) {
      format = "txt";
      text = await file.text();
    } else if (fileName.endsWith(".pdf")) {
      format = "pdf";
      const buffer = Buffer.from(await file.arrayBuffer());
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      text = result.text || "";
      await parser.destroy();
    } else if (fileName.endsWith(".docx")) {
      format = "docx";
      const buffer = Buffer.from(await file.arrayBuffer());
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Use .txt, .pdf, or .docx" },
        { status: 400 }
      );
    }

    if (!text.trim()) {
      return NextResponse.json({ error: "No text extracted from file" }, { status: 400 });
    }

    return NextResponse.json({
      text: text.trim(),
      format,
      fileName: file.name,
      fileSize,
      charCount: text.length,
      wordCount: text.split(/\s+/).filter((w: string) => w.length > 0).length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Upload error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
