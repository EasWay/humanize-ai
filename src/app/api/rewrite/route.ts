// POST /api/rewrite — Rewrite AI text to pass detection
import { NextRequest, NextResponse } from "next/server";
import { rewriteIterative, RewriteOptions } from "@/lib/rewrite";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, domain = "blog", intensity = "medium", targetDetector = "general", passes = 1 } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing 'text' field" }, { status: 400 });
    }

    if (text.length > 10000) {
      return NextResponse.json({ error: "Text too long. Max 10,000 characters." }, { status: 400 });
    }

    const options: RewriteOptions = {
      text,
      domain,
      intensity,
      targetDetector,
    };

    const useMultiPass = passes > 1;
    const result = useMultiPass
      ? await rewriteIterative(options, Math.min(passes, 3))
      : await (async () => {
          const { rewriteText } = await import("@/lib/rewrite");
          return rewriteText(options);
        })();

    return NextResponse.json({
      original: result.original,
      rewritten: result.rewritten,
      passes: result.passes,
      model: result.model,
      originalLength: result.original.length,
      rewrittenLength: result.rewritten.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Rewrite error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
