// POST /api/rewrite — Rewrite academic text to pass detection
import { NextRequest, NextResponse } from "next/server";
import { rewriteText, rewriteIterative } from "@/lib/rewrite";

const CHUNK_SIZE = 2000;

// Split text into chunks at paragraph boundaries
function chunkText(text: string, maxLen: number = CHUNK_SIZE): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  const paragraphs = text.split(/(\n\s*\n)/);
  let current = "";

  for (const para of paragraphs) {
    if ((current + para).length > maxLen && current.trim().length > 0) {
      chunks.push(current.trim());
      current = para;
    } else {
      current += para;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // Fallback for oversized paragraphs
  const result: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= maxLen) {
      result.push(chunk);
    } else {
      const sentences = chunk.match(/[^.!?]+[.!?]+/g) || [chunk];
      let sub = "";
      for (const sent of sentences) {
        if ((sub + " " + sent).length > maxLen && sub.length > 0) {
          result.push(sub.trim());
          sub = sent;
        } else {
          sub = sub ? sub + " " + sent : sent;
        }
      }
      if (sub.trim()) result.push(sub.trim());
    }
  }

  return result;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, passes = 1 } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing 'text' field" }, { status: 400 });
    }

    // No character limit — chunk processing handles long docs

    // If text fits in one chunk, process directly
    if (text.length <= CHUNK_SIZE) {
      const useMultiPass = passes > 1;
      const result = useMultiPass
        ? await rewriteIterative({ text, domain: "academic", intensity: "aggressive" }, Math.min(passes, 3))
        : await rewriteText({ text, domain: "academic", intensity: "aggressive" });

      return NextResponse.json({
        original: result.original,
        rewritten: result.rewritten,
        passes: result.passes,
        model: result.model,
        layersApplied: result.layersApplied,
        originalLength: result.original.length,
        rewrittenLength: result.rewritten.length,
        chunks: 1,
      });
    }

    // Long text: process in chunks
    const chunks = chunkText(text, CHUNK_SIZE);
    const rewrittenChunks: string[] = [];
    const allLayers: string[] = [];

    for (const chunk of chunks) {
      const result = await rewriteText({ text: chunk, domain: "academic", intensity: "aggressive" });
      rewrittenChunks.push(result.rewritten);
      allLayers.push(...result.layersApplied);
    }

    return NextResponse.json({
      original: text,
      rewritten: rewrittenChunks.join("\n\n"),
      passes: 1,
      model: "meta/llama-3.3-70b-instruct",
      layersApplied: Array.from(new Set(allLayers)),
      originalLength: text.length,
      rewrittenLength: rewrittenChunks.join("\n\n").length,
      chunks: chunks.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Rewrite error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
