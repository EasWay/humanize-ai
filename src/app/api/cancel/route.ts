// POST /api/cancel — Cancel a running job
import { NextRequest, NextResponse } from "next/server";
import { getJob, updateJob } from "@/lib/jobs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing job id" }, { status: 400 });
    }

    const job = getJob(id);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.status === "done" || job.status === "error") {
      return NextResponse.json({ error: "Job already finished", status: job.status }, { status: 400 });
    }

    updateJob(id, { status: "error", error: "Cancelled by user" });

    return NextResponse.json({ id, status: "cancelled" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
