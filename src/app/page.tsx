"use client";

import { useState, useCallback, useRef } from "react";

type Domain = "academic" | "blog" | "technical" | "creative";
type FileFormat = "txt" | "pdf" | "docx" | null;

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
  const [domain, setDomain] = useState<Domain>("blog");
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detection, setDetection] = useState<DetectionResponse | null>(null);
  const [result, setResult] = useState<RewriteResponse | null>(null);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileFormat, setFileFormat] = useState<FileFormat>(null);
  const [uploading, setUploading] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [fetchingUrl, setFetchingUrl] = useState(false);
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

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setInput(data.text);
      setFileFormat(data.format as FileFormat);
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

  const handleFetchUrl = useCallback(async () => {
    if (!urlInput.trim()) return;
    setFetchingUrl(true);
    setError("");
    try {
      const res = await fetch("/api/fetch-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setInput(data.text);
      setFileName(data.url);
      setFileFormat("txt");
      setOutput("");
      setResult(null);
      setDetection(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "URL fetch failed");
    } finally {
      setFetchingUrl(false);
    }
  }, [urlInput]);

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
    try {
      const res = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: input,
          domain,
          intensity: "aggressive",
          passes: 1,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data: RewriteResponse = await res.json();
      setResult(data);
      setOutput(data.rewritten);

      // Auto-detect rewritten text
      const detectRes = await fetch("/api/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: data.rewritten }),
      });
      if (detectRes.ok) setDetection(await detectRes.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Rewrite failed");
    } finally {
      setLoading(false);
    }
  }, [input, domain]);

  const handleDownload = useCallback(() => {
    if (!output) return;

    const baseName = fileName ? fileName.replace(/\.[^.]+$/, "") : "humanized";
    let blob: Blob;
    let downloadName: string;

    if (fileFormat === "docx") {
      // For docx, download as txt (preserving content)
      blob = new Blob([output], { type: "text/plain" });
      downloadName = `${baseName}_humanized.txt`;
    } else if (fileFormat === "pdf") {
      // For pdf, download as txt
      blob = new Blob([output], { type: "text/plain" });
      downloadName = `${baseName}_humanized.txt`;
    } else {
      blob = new Blob([output], { type: "text/plain" });
      downloadName = `${baseName}_humanized.txt`;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadName;
    a.click();
    URL.revokeObjectURL(url);
  }, [output, fileName, fileFormat]);

  const handleCopy = () => {
    navigator.clipboard.writeText(output);
  };

  return (
    <div className="min-h-screen bg-white text-zinc-900 font-[family-name:var(--font-inter)]">
      {/* Header */}
      <header className="border-b border-zinc-100 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight text-zinc-900">
            humanize<span className="text-emerald-600">.ai</span>
          </h1>
          <span className="text-xs text-zinc-400">Free &bull; No account</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* File Upload */}
        <div className="mb-6">
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
            className="w-full border-2 border-dashed border-zinc-200 rounded-xl p-6 text-center hover:border-emerald-300 hover:bg-emerald-50/30 transition cursor-pointer"
          >
            {uploading ? (
              <span className="text-sm text-zinc-500">Reading file...</span>
            ) : fileName ? (
              <div>
                <span className="text-sm text-zinc-600">{fileName}</span>
                <span className="text-xs text-zinc-400 ml-2">({fileFormat?.toUpperCase()})</span>
              </div>
            ) : (
              <div>
                <p className="text-sm text-zinc-500">Drop a file or click to upload</p>
                <p className="text-xs text-zinc-400 mt-1">.txt, .pdf, .docx</p>
              </div>
            )}
          </button>
        </div>

        {/* URL Input */}
        <div className="mb-4 flex gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Or paste a URL to extract text..."
            className="flex-1 bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2.5 text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition"
            onKeyDown={(e) => e.key === "Enter" && handleFetchUrl()}
          />
          <button
            onClick={handleFetchUrl}
            disabled={fetchingUrl || !urlInput.trim()}
            className="px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 disabled:bg-zinc-50 disabled:text-zinc-300 text-sm font-medium rounded-lg transition"
          >
            {fetchingUrl ? "..." : "Fetch"}
          </button>
        </div>

        {/* Input */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-zinc-700">Input</label>
            <span className="text-xs text-zinc-400">{input.length} chars</span>
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste your text or upload a file..."
            className="w-full h-64 bg-zinc-50 border border-zinc-200 rounded-xl p-4 text-sm text-zinc-800 placeholder-zinc-400 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition"
          />
        </div>

        {/* Domain Selector */}
        <div className="flex gap-2 mb-4">
          {(["blog", "academic", "technical", "creative"] as Domain[]).map((d) => (
            <button
              key={d}
              onClick={() => setDomain(d)}
              className={`px-4 py-2 text-sm rounded-lg transition font-medium ${
                domain === d
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={handleDetect}
            disabled={detecting || !input.trim()}
            className="flex-1 px-5 py-3 bg-zinc-100 hover:bg-zinc-200 disabled:bg-zinc-50 disabled:text-zinc-300 text-sm font-medium rounded-xl transition"
          >
            {detecting ? "Scanning..." : "Scan for AI"}
          </button>
          <button
            onClick={handleRewrite}
            disabled={loading || !input.trim()}
            className="flex-1 px-5 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-300 text-white text-sm font-medium rounded-xl transition shadow-sm"
          >
            {loading ? "Humanizing..." : "Humanize"}
          </button>
        </div>

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
              <label className="text-sm font-medium text-zinc-700">Output</label>
              <div className="flex gap-3">
                <button onClick={handleCopy} className="text-xs text-emerald-600 hover:text-emerald-500 font-medium">
                  Copy
                </button>
                <button onClick={handleDownload} className="text-xs text-emerald-600 hover:text-emerald-500 font-medium">
                  Download
                </button>
              </div>
            </div>
            <div className="w-full min-h-64 bg-zinc-50 border border-zinc-200 rounded-xl p-4 text-sm text-zinc-800 whitespace-pre-wrap">
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

            {/* Metrics */}
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
                        className={`h-1.5 rounded-full transition-all ${
                          s.value >= 60 ? "bg-emerald-500" : s.value >= 40 ? "bg-amber-500" : "bg-red-500"
                        }`}
                        style={{ width: `${s.value}%` }}
                      />
                    </div>
                    <span className="text-xs text-zinc-500 w-8 text-right">{s.value}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Flagged Patterns */}
            {detection.patternAnalysis.matches.length > 0 && (
              <div className="mt-4">
                <div className="text-xs text-zinc-400 mb-2">Flagged Patterns</div>
                <div className="flex flex-wrap gap-1.5">
                  {detection.patternAnalysis.matches.slice(0, 15).map((m, i) => (
                    <span
                      key={i}
                      className={`text-xs px-2 py-0.5 rounded-md ${
                        m.tier === 1 ? "bg-red-50 text-red-500 border border-red-100" :
                        m.tier === 2 ? "bg-amber-50 text-amber-600 border border-amber-100" :
                        "bg-zinc-100 text-zinc-500 border border-zinc-200"
                      }`}
                    >
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
            <span>{result.passes} pass{result.passes > 1 ? "es" : ""}</span>
            <span>{result.originalLength} &rarr; {result.rewrittenLength} chars</span>
            {result.chunks && result.chunks > 1 && (
              <span>{result.chunks} chunks processed</span>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-100">
        <div className="max-w-3xl mx-auto px-4 py-6 text-center text-xs text-zinc-400">
          No data stored. No tracking. No accounts. Powered by Llama 3.3 70B.
        </div>
      </footer>
    </div>
  );
}
