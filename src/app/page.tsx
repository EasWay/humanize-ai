"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface JobStatus {
  id: string;
  status: "queued" | "processing" | "done" | "error";
  chunksDone: number;
  chunksTotal: number;
  progress: number;
  output: string;
  error: string;
  fileName: string;
}

export default function Home() {
  const [input, setInput] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileFormat, setFileFormat] = useState("txt");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  // Job state
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [starting, setStarting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // File upload
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["txt", "pdf", "docx"].includes(ext || "")) {
      setError("Unsupported file. Use .txt, .pdf, or .docx");
      return;
    }

    setUploading(true);
    setError("");
    setFileName(file.name);
    setJobId(null);
    setJob(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setInput(data.text);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setFileName("");
    } finally {
      setUploading(false);
    }
  }, []);

  // Start job
  const handleStart = useCallback(async () => {
    if (!input.trim()) return;
    setStarting(true);
    setError("");
    setJob(null);

    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input, fileName }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setJobId(data.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to start");
    } finally {
      setStarting(false);
    }
  }, [input, fileName]);

  // Poll job status
  useEffect(() => {
    if (!jobId) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/jobs?id=${jobId}`);
        if (!res.ok) return;
        const data: JobStatus = await res.json();
        setJob(data);

        if (data.status === "done" || data.status === "error") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // silent retry
      }
    };

    poll(); // immediate
    pollRef.current = setInterval(poll, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId]);

  // Copy output
  const handleCopy = () => {
    if (job?.output) navigator.clipboard.writeText(job.output);
  };

  // Download output
  const handleDownload = () => {
    if (!job?.output) return;
    const baseName = fileName ? fileName.replace(/\.[^.]+$/, "") : "humanized";
    const blob = new Blob([job.output], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName}_humanized.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-white text-zinc-900 font-sans">
      {/* Header */}
      <header className="border-b border-zinc-100 bg-white sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight text-zinc-900">
            humanize<span className="text-emerald-600">.ai</span>
          </h1>
          <span className="text-xs text-zinc-400">Academic &bull; Free</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* File Upload */}
        {!jobId && (
          <>
            <div className="mb-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.pdf,.docx"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full border-2 border-dashed border-zinc-200 rounded-xl p-5 text-center hover:border-emerald-300 hover:bg-emerald-50/20 transition cursor-pointer"
              >
                {uploading ? (
                  <span className="text-sm text-zinc-500">Reading file...</span>
                ) : fileName ? (
                  <span className="text-sm text-zinc-600">{fileName}</span>
                ) : (
                  <div>
                    <p className="text-sm text-zinc-500">Upload research paper (.txt, .pdf, .docx)</p>
                    <p className="text-xs text-zinc-400 mt-1">Citations, URLs, and references are preserved</p>
                  </div>
                )}
              </button>
            </div>

            {/* Input */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-zinc-700">Paper Text</label>
                <span className="text-xs text-zinc-400">{input.length.toLocaleString()} chars</span>
              </div>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Paste your research paper text here..."
                className="w-full h-72 bg-zinc-50 border border-zinc-200 rounded-xl p-4 text-sm text-zinc-800 placeholder-zinc-400 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition leading-relaxed"
              />
            </div>

            {/* Start Button */}
            <button
              onClick={handleStart}
              disabled={starting || !input.trim()}
              className="w-full px-5 py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-300 text-white text-sm font-medium rounded-xl transition shadow-sm"
            >
              {starting ? "Starting..." : "Start Humanizing"}
            </button>
          </>
        )}

        {/* Job Progress */}
        {jobId && job && (
          <div className="space-y-6">
            {/* Status Card */}
            <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-700">
                    {job.status === "done" ? "Complete" :
                     job.status === "error" ? "Failed" :
                     job.status === "processing" ? "Processing..." : "Queued"}
                  </h2>
                  {job.fileName && (
                    <p className="text-xs text-zinc-400 mt-0.5">{job.fileName}</p>
                  )}
                </div>
                <span className={`text-2xl font-bold ${
                  job.status === "done" ? "text-emerald-500" :
                  job.status === "error" ? "text-red-500" :
                  "text-zinc-400"
                }`}>
                  {job.status === "done" ? "100%" :
                   job.status === "error" ? "!" :
                   `${job.progress}%`}
                </span>
              </div>

              {/* Progress Bar */}
              {job.status === "processing" && (
                <div className="mb-4">
                  <div className="w-full bg-zinc-200 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-emerald-500 transition-all duration-1000"
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-zinc-400 mt-2">
                    Chunk {job.chunksDone} of {job.chunksTotal}
                  </p>
                </div>
              )}

              {/* Steps */}
              {job.status === "processing" && (
                <div className="space-y-2 mt-4">
                  {[
                    { label: "Analyzing document", done: true },
                    { label: "Protecting citations", done: true },
                    { label: `Humanizing text (${job.chunksDone}/${job.chunksTotal})`, done: false },
                  ].map((step, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                        step.done ? "bg-emerald-500 text-white" : "bg-zinc-200 text-zinc-400"
                      }`}>
                        {step.done ? "✓" : "•"}
                      </div>
                      <span className={step.done ? "text-zinc-500" : "text-zinc-700"}>{step.label}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Error */}
              {job.status === "error" && (
                <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
                  {job.error}
                </div>
              )}

              {/* Tip while waiting */}
              {job.status === "processing" && (
                <p className="text-xs text-zinc-400 mt-4">
                  You can close this tab and come back. Your result will be ready when you return.
                </p>
              )}
            </div>

            {/* Output */}
            {job.status === "done" && job.output && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-zinc-700">Humanized Output</label>
                  <div className="flex gap-3">
                    <button onClick={handleCopy} className="text-xs text-emerald-600 hover:text-emerald-500 font-medium">Copy</button>
                    <button onClick={handleDownload} className="text-xs text-emerald-600 hover:text-emerald-500 font-medium">Download</button>
                  </div>
                </div>
                <div className="w-full min-h-72 bg-zinc-50 border border-zinc-200 rounded-xl p-4 text-sm text-zinc-800 whitespace-pre-wrap leading-relaxed">
                  {job.output}
                </div>
              </div>
            )}

            {/* New Job Button */}
            {(job.status === "done" || job.status === "error") && (
              <button
                onClick={() => { setJobId(null); setJob(null); setInput(""); setFileName(""); }}
                className="w-full px-5 py-3 bg-zinc-100 hover:bg-zinc-200 text-sm font-medium rounded-xl transition"
              >
                Humanize Another Document
              </button>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
            {error}
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-100">
        <div className="max-w-3xl mx-auto px-4 py-6 text-center text-xs text-zinc-400">
          Preserves citations, URLs, and references. Powered by Llama 3.3 70B.
        </div>
      </footer>
    </div>
  );
}
