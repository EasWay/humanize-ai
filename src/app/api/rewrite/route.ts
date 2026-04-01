// POST /api/rewrite — Rewrite a single chunk of text
import { NextRequest, NextResponse } from "next/server";
import { rewriteText } from "@/lib/rewrite";

const MAX_CHUNK = 2000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing 'text' field" }, { status: 400 });
    }

    // Cap at single chunk size
    const safeText = text.slice(0, MAX_CHUNK);

    const result = await rewriteText({ text: safeText, domain: "academic", intensity: "aggressive" });

    return NextResponse.json({
      rewritten: result.rewritten,
      layersApplied: result.layersApplied,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Rewrite error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
