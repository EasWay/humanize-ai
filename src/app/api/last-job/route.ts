import { NextResponse } from "next/server";
import { getLastJob } from "@/lib/jobs";

export async function GET() {
  const job = getLastJob();
  if (!job) return NextResponse.json({ error: "No jobs found" }, { status: 404 });

  return NextResponse.json({
    id: job.id,
    status: job.status,
    chunksDone: job.chunksDone,
    chunksTotal: job.chunksTotal,
    progress: job.chunksTotal > 0 ? Math.round((job.chunksDone / job.chunksTotal) * 100) : 0,
    output: job.output,
    error: job.error,
    fileName: job.fileName,
    fileFormat: job.fileFormat,
    hasInput: job.input.length > 0,
  });
}
