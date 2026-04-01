// Simple in-memory job store with file persistence
// Persists across requests and survives server restarts

import { readFileSync, writeFileSync, existsSync } from "fs";

export interface Job {
  id: string;
  status: "queued" | "processing" | "done" | "error";
  input: string;
  output: string;
  fileName: string;
  fileFormat: string;
  chunksTotal: number;
  chunksDone: number;
  error: string;
  createdAt: number;
  updatedAt: number;
}

const JOBS_FILE = "/tmp/humanize-jobs.json";

function loadJobs(): Map<string, Job> {
  try {
    if (existsSync(JOBS_FILE)) {
      const data = JSON.parse(readFileSync(JOBS_FILE, "utf-8"));
      return new Map(Object.entries(data));
    }
  } catch { /* ignore */ }
  return new Map();
}

function saveJobs(jobs: Map<string, Job>): void {
  try {
    const obj: Record<string, Job> = {};
    for (const [k, v] of jobs) {
      // Don't persist the full input text to save disk space
      if (v.status === "processing" || v.status === "queued") {
        obj[k] = v;
      } else {
        // For done/error jobs, keep output but clear input
        obj[k] = { ...v, input: "" };
      }
    }
    writeFileSync(JOBS_FILE, JSON.stringify(obj));
  } catch { /* ignore */ }
}

const jobs = loadJobs();

// Clean up old jobs every hour
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000; // 2 hours
  let changed = false;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) { jobs.delete(id); changed = true; }
  }
  if (changed) saveJobs(jobs);
}, 60 * 60 * 1000);

// Get the most recent job (for auto-resume)
export function getLastJob(): Job | undefined {
  let latest: Job | undefined;
  for (const job of jobs.values()) {
    if (!latest || job.updatedAt > latest.updatedAt) {
      latest = job;
    }
  }
  return latest;
}

export function createJob(input: string, fileName: string, fileFormat: string, totalChunks: number): Job {
  const id = Math.random().toString(36).slice(2, 10);
  const job: Job = {
    id,
    status: "queued",
    input,
    output: "",
    fileName,
    fileFormat,
    chunksTotal: totalChunks,
    chunksDone: 0,
    error: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(id, job);
  saveJobs(jobs);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function updateJob(id: string, updates: Partial<Job>): void {
  const job = jobs.get(id);
  if (job) {
    Object.assign(job, updates, { updatedAt: Date.now() });
    saveJobs(jobs);
  }
}
