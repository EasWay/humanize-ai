// POST /api/detect — Analyze text for AI detection signals
import { NextRequest, NextResponse } from "next/server";
import { detectText } from "@/lib/detect";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing 'text' field" }, { status: 400 });
    }

    if (text.length > 50000) {
      return NextResponse.json({ error: "Text too long. Max 50,000 characters." }, { status: 400 });
    }

    const result = detectText(text);

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Detection error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
