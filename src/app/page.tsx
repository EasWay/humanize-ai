"use client";

import { useState, useCallback, useRef } from "react";

interface RewriteResponse {
  original: string;
  rewritten: string;
  passes: number;
  model: string;
  layersApplied: string[];
  originalLength: number;
  rewrittenLength: number;
  chunks?: number;
}

interface DetectionResponse {
  isAiGenerated: boolean;
  confidence: number;
  humanScore: number;
  aiScore: number;
  detectorScores: {
    perplexity: number;
    burstiness: number;
    vocabularyRichness: number;
    structuralVariety: number;
  };
  patternAnalysis: {
    score: number;
    tier: string;
    matches: Array<{ match: string; category: string; tier: number }>;
    stats: {
      sentenceLengthVariance: number;
      avgSentenceLength: number;
      paragraphCount: number;
      contractionRate: number;
      aiPatternCount: number;
    };
  };
}

export default function Home() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<Array<{ label: string; status: "pending" | "active" | "done"; chunks?: number; current?: number }>>([]);
  const [detecting, setDetecting] = useState(false);
  const [detection, setDetection] = useState<DetectionResponse | null>(null);
  const [result, setResult] = useState<RewriteResponse | null>(null);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setInput(data.text);
      setOutput("");
      setResult(null);
      setDetection(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setFileName("");
    } finally {
      setUploading(false);
    }
  }, []);

  const handleDetect = useCallback(async () => {
    if (!input.trim()) return;
    setDetecting(true);
    setDetection(null);
    setError("");
    try {
      const res = await fetch("/api/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input }),
      });
      if (!res.ok) throw new Error(await res.text());
      setDetection(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Detection failed");
    } finally {
      setDetecting(false);
    }
  }, [input]);

  const handleRewrite = useCallback(async () => {
    if (!input.trim()) return;
    setLoading(true);
    setOutput("");
    setResult(null);
    setError("");
    setSteps([
      { label: "Analyzing document", status: "pending" },
      { label: "Protecting citations & references", status: "pending" },
      { label: "Humanizing text", status: "pending" },
      { label: "Running detection check", status: "pending" },
    ]);

    try {
      // Step 1: Analyze
      setSteps(prev => prev.map((s, i) => i === 0 ? { ...s, status: "active" } : s));
      await new Promise(r => setTimeout(r, 500));
      setSteps(prev => prev.map((s, i) => i === 0 ? { ...s, status: "done" } : s));

      // Step 2: Protect citations
      setSteps(prev => prev.map((s, i) => i === 1 ? { ...s, status: "active" } : s));
      await new Promise(r => setTimeout(r, 300));
      setSteps(prev => prev.map((s, i) => i === 1 ? { ...s, status: "done" } : s));

      // Step 3: Chunk and humanize
      const CHUNK_SIZE = 1800;
      const paragraphs = input.split(/(\n\s*\n)/);
      const chunks: string[] = [];
      let current = "";

      for (const para of paragraphs) {
        if ((current + para).length > CHUNK_SIZE && current.trim().length > 0) {
          chunks.push(current.trim());
          current = para;
        } else {
          current += para;
        }
      }
      if (current.trim()) chunks.push(current.trim());

      const finalChunks: string[] = [];
      for (const chunk of chunks) {
        if (chunk.length <= CHUNK_SIZE) {
          finalChunks.push(chunk);
        } else {
          const sentences = chunk.match(/[^.!?]+[.!?]+/g) || [chunk];
          let sub = "";
          for (const sent of sentences) {
            if ((sub + " " + sent).length > CHUNK_SIZE && sub.length > 0) {
              finalChunks.push(sub.trim());
              sub = sent;
            } else {
              sub = sub ? sub + " " + sent : sent;
            }
          }
          if (sub.trim()) finalChunks.push(sub.trim());
        }
      }

      setSteps(prev => prev.map((s, i) => i === 2 ? { ...s, status: "active", chunks: finalChunks.length, current: 0 } : s));

      // Retry wrapper for rate limits
      async function fetchWithRetry(body: string, maxRetries = 3): Promise<{ rewritten: string }> {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          const res = await fetch("/api/rewrite", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          });
          if (res.ok) return res.json();
          if (res.status === 429 && attempt < maxRetries) {
            const wait = Math.min(3000 * Math.pow(2, attempt), 15000);
            await new Promise(r => setTimeout(r, wait));
            continue;
          }
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Request failed`);
        }
        throw new Error("Max retries exceeded");
      }

      const rewrittenChunks: string[] = [];
      for (let i = 0; i < finalChunks.length; i++) {
        setSteps(prev => prev.map((s, idx) => idx === 2 ? { ...s, current: i + 1 } : s));

        const data = await fetchWithRetry(JSON.stringify({ text: finalChunks[i] }));
        rewrittenChunks.push(data.rewritten);

        // 2 second delay between chunks to respect rate limits
        if (i < finalChunks.length - 1) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      setSteps(prev => prev.map((s, i) => i === 2 ? { ...s, status: "done" } : s));

      const fullOutput = rewrittenChunks.join("\n\n");
      setOutput(fullOutput);
      setResult({
        original: input,
        rewritten: fullOutput,
        passes: 1,
        model: "meta/llama-3.3-70b-instruct",
        layersApplied: ["academic-rewrite", "citation-restore", "post-processing"],
        originalLength: input.length,
        rewrittenLength: fullOutput.length,
        chunks: finalChunks.length,
      });

      // Step 4: Detection
      setSteps(prev => prev.map((s, i) => i === 3 ? { ...s, status: "active" } : s));
      const detectRes = await fetch("/api/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: fullOutput }),
      });
      if (detectRes.ok) setDetection(await detectRes.json());
      setSteps(prev => prev.map((s, i) => i === 3 ? { ...s, status: "done" } : s));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Rewrite failed");
    } finally {
      setLoading(false);
    }
  }, [input]);

  const handleDownload = useCallback(() => {
    if (!output) return;
    const baseName = fileName ? fileName.replace(/\.[^.]+$/, "") : "humanized";
    const blob = new Blob([output], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName}_humanized.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [output, fileName]);

  const handleCopy = () => navigator.clipboard.writeText(output);

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
            placeholder="Paste your research paper text here. Citations, URLs, and references will be preserved exactly..."
            className="w-full h-72 bg-zinc-50 border border-zinc-200 rounded-xl p-4 text-sm text-zinc-800 placeholder-zinc-400 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition leading-relaxed"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={handleDetect}
            disabled={detecting || !input.trim()}
            className="flex-1 px-5 py-3 bg-zinc-100 hover:bg-zinc-200 disabled:bg-zinc-50 disabled:text-zinc-300 text-sm font-medium rounded-xl transition"
          >
            {detecting ? "Scanning..." : "Check AI Score"}
          </button>
          <button
            onClick={handleRewrite}
            disabled={loading || !input.trim()}
            className="flex-1 px-5 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-300 text-white text-sm font-medium rounded-xl transition shadow-sm"
          >
            {loading ? "Humanizing..." : "Humanize"}
          </button>
        </div>

        {/* Progress Steps */}
        {loading && steps.length > 0 && (
          <div className="mb-6 space-y-3">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                {/* Step indicator */}
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-medium transition-all ${
                  step.status === "done"
                    ? "bg-emerald-500 text-white"
                    : step.status === "active"
                    ? "bg-emerald-100 text-emerald-600 ring-2 ring-emerald-500 ring-offset-2"
                    : "bg-zinc-100 text-zinc-400"
                }`}>
                  {step.status === "done" ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>

                {/* Step content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm ${
                      step.status === "active" ? "text-zinc-900 font-medium" :
                      step.status === "done" ? "text-zinc-500" :
                      "text-zinc-400"
                    }`}>
                      {step.label}
                    </span>
                    {step.chunks && step.status === "active" && (
                      <span className="text-xs text-zinc-400">{step.current}/{step.chunks}</span>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-zinc-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-500 ${
                        step.status === "done" ? "bg-emerald-500" :
                        step.status === "active" ? "bg-emerald-400" :
                        "bg-transparent"
                      }`}
                      style={{
                        width: step.status === "done"
                          ? "100%"
                          : step.status === "active" && step.chunks
                          ? `${((step.current || 0) / step.chunks) * 100}%`
                          : step.status === "active"
                          ? "60%"
                          : "0%",
                        animation: step.status === "active" && !step.chunks ? "pulse 2s infinite" : undefined
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Output */}
        {output && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-zinc-700">Humanized Output</label>
              <div className="flex gap-3">
                <button onClick={handleCopy} className="text-xs text-emerald-600 hover:text-emerald-500 font-medium">Copy</button>
                <button onClick={handleDownload} className="text-xs text-emerald-600 hover:text-emerald-500 font-medium">Download</button>
              </div>
            </div>
            <div className="w-full min-h-72 bg-zinc-50 border border-zinc-200 rounded-xl p-4 text-sm text-zinc-800 whitespace-pre-wrap leading-relaxed">
              {output}
            </div>
          </div>
        )}

        {/* Detection Results */}
        {detection && (
          <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-6 mb-6">
            <h2 className="text-sm font-semibold text-zinc-700 mb-4">Detection Analysis</h2>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-white rounded-lg p-4 border border-zinc-100">
                <div className={`text-3xl font-bold ${detection.aiScore >= 70 ? "text-red-500" : detection.aiScore >= 40 ? "text-amber-500" : "text-emerald-500"}`}>
                  {detection.aiScore}%
                </div>
                <div className="text-xs text-zinc-400 mt-1">AI Probability</div>
              </div>
              <div className="bg-white rounded-lg p-4 border border-zinc-100">
                <div className={`text-3xl font-bold ${detection.isAiGenerated ? "text-red-500" : "text-emerald-500"}`}>
                  {detection.isAiGenerated ? "AI" : "Human"}
                </div>
                <div className="text-xs text-zinc-400 mt-1">
                  {Math.round(detection.confidence * 100)}% confidence
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Perplexity", value: detection.detectorScores.perplexity },
                { label: "Burstiness", value: detection.detectorScores.burstiness },
                { label: "Vocabulary", value: detection.detectorScores.vocabularyRichness },
                { label: "Structure", value: detection.detectorScores.structuralVariety },
              ].map((s) => (
                <div key={s.label} className="bg-white rounded-lg p-3 border border-zinc-100">
                  <div className="text-xs text-zinc-400 mb-1">{s.label}</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-zinc-100 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${s.value >= 60 ? "bg-emerald-500" : s.value >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                        style={{ width: `${s.value}%` }}
                      />
                    </div>
                    <span className="text-xs text-zinc-500 w-8 text-right">{s.value}</span>
                  </div>
                </div>
              ))}
            </div>

            {detection.patternAnalysis.matches.length > 0 && (
              <div className="mt-4">
                <div className="text-xs text-zinc-400 mb-2">Flagged Patterns</div>
                <div className="flex flex-wrap gap-1.5">
                  {detection.patternAnalysis.matches.slice(0, 15).map((m, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded-md bg-red-50 text-red-500 border border-red-100">
                      {m.match}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Result Meta */}
        {result && (
          <div className="flex flex-wrap gap-4 text-xs text-zinc-400 mb-8">
            <span>{result.originalLength.toLocaleString()} &rarr; {result.rewrittenLength.toLocaleString()} chars</span>
            {result.chunks && result.chunks > 1 && <span>{result.chunks} chunks</span>}
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
