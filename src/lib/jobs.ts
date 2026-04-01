// Simple in-memory job store
// Persists across requests on the same server instance

export interface Job {
  id: string;
  status: "queued" | "processing" | "done" | "error";
  input: string;
  output: string;
  fileName: string;
  chunksTotal: number;
  chunksDone: number;
  error: string;
  createdAt: number;
  updatedAt: number;
}

const jobs = new Map<string, Job>();

// Clean up old jobs every hour
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000; // 2 hours
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}, 60 * 60 * 1000);

export function createJob(input: string, fileName: string, totalChunks: number): Job {
  const id = Math.random().toString(36).slice(2, 10);
  const job: Job = {
    id,
    status: "queued",
    input,
    output: "",
    fileName,
    chunksTotal: totalChunks,
    chunksDone: 0,
    error: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function updateJob(id: string, updates: Partial<Job>): void {
  const job = jobs.get(id);
  if (job) {
    Object.assign(job, updates, { updatedAt: Date.now() });
  }
}
