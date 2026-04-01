// POST /api/rewrite — Rewrite AI text to pass detection
import { NextRequest, NextResponse } from "next/server";
import { rewriteText, rewriteIterative, RewriteOptions } from "@/lib/rewrite";

const MAX_CHARS = 50000;
const CHUNK_SIZE = 3000; // Process in chunks to stay within LLM context

// Split text into chunks at paragraph boundaries
function chunkText(text: string, maxLen: number = CHUNK_SIZE): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  const paragraphs = text.split(/\n\s*\n/);
  let current = "";

  for (const para of paragraphs) {
    if ((current + "\n\n" + para).length > maxLen && current.length > 0) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }

  if (current.trim()) chunks.push(current.trim());

  // If a single paragraph is too long, split by sentences
  const result: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= maxLen) {
      result.push(chunk);
    } else {
      const sentences = chunk.match(/[^.!?]+[.!?]+/g) || [chunk];
      let subChunk = "";
      for (const sent of sentences) {
        if ((subChunk + " " + sent).length > maxLen && subChunk.length > 0) {
          result.push(subChunk.trim());
          subChunk = sent;
        } else {
          subChunk = subChunk ? subChunk + " " + sent : sent;
        }
      }
      if (subChunk.trim()) result.push(subChunk.trim());
    }
  }

  return result;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, domain = "blog", intensity = "aggressive", passes = 1 } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing 'text' field" }, { status: 400 });
    }

    if (text.length > MAX_CHARS) {
      return NextResponse.json({ error: `Text too long. Max ${MAX_CHARS.toLocaleString()} characters.` }, { status: 400 });
    }

    const options: RewriteOptions = {
      text,
      domain,
      intensity,
    };

    // If text fits in one chunk, process normally
    if (text.length <= CHUNK_SIZE) {
      const useMultiPass = passes > 1;
      const result = useMultiPass
        ? await rewriteIterative(options, Math.min(passes, 3))
        : await rewriteText(options);

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

    for (let i = 0; i < chunks.length; i++) {
      const chunkOptions: RewriteOptions = {
        text: chunks[i],
        domain,
        intensity,
      };
      const result = await rewriteText(chunkOptions);
      rewrittenChunks.push(result.rewritten);
      allLayers.push(...result.layersApplied);
    }

    const rewritten = rewrittenChunks.join("\n\n");

    return NextResponse.json({
      original: text,
      rewritten,
      passes: 1,
      model: "meta/llama-3.3-70b-instruct + meta/llama-3.1-8b-instruct",
      layersApplied: Array.from(new Set(allLayers)),
      originalLength: text.length,
      rewrittenLength: rewritten.length,
      chunks: chunks.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Rewrite error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
