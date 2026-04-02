// POST /api/jobs — Create a new humanization job
// GET /api/jobs?id=xxx — Check job status
import { NextRequest, NextResponse } from "next/server";
import { createJob, getJob, updateJob } from "@/lib/jobs";
import { rewriteText } from "@/lib/rewrite";

const CHUNK_SIZE = 1800;

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

async function processJob(jobId: string) {
  const job = getJob(jobId);
  if (!job) return;

  updateJob(jobId, { status: "processing" });

  try {
    const chunks = chunkText(job.input);
    const rewritten: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      updateJob(jobId, { chunksDone: i });

      const result = await rewriteText({
        text: chunks[i],
        domain: "academic",
        intensity: "aggressive",
      });

      rewritten.push(result.rewritten);

      // Check if cancelled
      if (getJob(jobId)?.status === "error") {
        return; // stop processing
      }

      // Delay between chunks
      if (i < chunks.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    updateJob(jobId, {
      status: "done",
      output: rewritten.join("\n\n"),
      chunksDone: chunks.length,
    });
  } catch (e) {
    updateJob(jobId, {
      status: "error",
      error: e instanceof Error ? e.message : "Unknown error",
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, fileName = "", fileFormat = "txt", blocks = [] } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing 'text' field" }, { status: 400 });
    }

    const chunks = chunkText(text);
    const job = createJob(text, fileName, fileFormat, chunks.length, blocks);

    // Start processing in background (non-blocking)
    processJob(job.id);

    return NextResponse.json({
      id: job.id,
      status: job.status,
      chunksTotal: job.chunksTotal,
      message: "Job started. Check status with GET /api/jobs?id=" + job.id,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing 'id' parameter" }, { status: 400 });
  }

  const job = getJob(id);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    chunksDone: job.chunksDone,
    chunksTotal: job.chunksTotal,
    progress: job.chunksTotal > 0 ? Math.round((job.chunksDone / job.chunksTotal) * 100) : 0,
    output: job.status === "done" ? job.output : "",
    error: job.error,
    fileName: job.fileName,
    fileFormat: job.fileFormat,
    createdAt: job.createdAt,
  });
}
