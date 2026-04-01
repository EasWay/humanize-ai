// POST /api/fetch-url — Extract text content from a URL
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Missing 'url' field" }, { status: 400 });
    }

    // Validate URL
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return NextResponse.json({ error: "Only HTTP(S) URLs are supported" }, { status: 400 });
    }

    // Fetch the page
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; HumanizeAI/1.0)",
        Accept: "text/html, text/plain, application/pdf",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return NextResponse.json({ error: `Failed to fetch: ${response.status}` }, { status: 400 });
    }

    const contentType = response.headers.get("content-type") || "";
    let text = "";

    if (contentType.includes("text/html")) {
      const html = await response.text();
      // Simple HTML to text extraction
      text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
    } else if (contentType.includes("text/plain")) {
      text = await response.text();
    } else {
      return NextResponse.json(
        { error: `Unsupported content type: ${contentType}` },
        { status: 400 }
      );
    }

    if (!text.trim()) {
      return NextResponse.json({ error: "No text content found" }, { status: 400 });
    }

    return NextResponse.json({
      text: text.trim(),
      url: parsed.href,
      contentType,
      charCount: text.length,
      wordCount: text.split(/\s+/).filter((w: string) => w.length > 0).length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("URL fetch error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
