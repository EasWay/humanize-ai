"use client";

import { useState, useCallback } from "react";

type Domain = "academic" | "blog" | "technical" | "creative";
type Intensity = "light" | "medium" | "aggressive";
type Detector = "general" | "gptzero" | "originality" | "turnitin";

interface RewriteResponse {
  original: string;
  rewritten: string;
  passes: number;
  model: string;
  originalLength: number;
  rewrittenLength: number;
}

interface DetectionResponse {
  isAiGenerated: boolean;
  confidence: number;
  humanScore: number;
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
  const [intensity, setIntensity] = useState<Intensity>("medium");
  const [detector, setDetector] = useState<Detector>("general");
  const [multiPass, setMultiPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detection, setDetection] = useState<DetectionResponse | null>(null);
  const [result, setResult] = useState<RewriteResponse | null>(null);
  const [error, setError] = useState("");

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
      const data = await res.json();
      setDetection(data);
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
          intensity,
          targetDetector: detector,
          passes: multiPass ? 3 : 1,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data: RewriteResponse = await res.json();
      setResult(data);
      setOutput(data.rewritten);

      // Auto-detect the rewritten text
      const detectRes = await fetch("/api/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: data.rewritten }),
      });
      if (detectRes.ok) {
        const detectData = await detectRes.json();
        setDetection(detectData);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Rewrite failed");
    } finally {
      setLoading(false);
    }
  }, [input, domain, intensity, detector, multiPass]);

  const handleCopy = () => {
    navigator.clipboard.writeText(output);
  };

  const scoreColor = (score: number) => {
    if (score >= 8) return "text-green-400";
    if (score >= 6) return "text-yellow-400";
    if (score >= 4) return "text-orange-400";
    return "text-red-400";
  };

  const tierLabel = (tier: string) => {
    const labels: Record<string, string> = {
      "obvious-ai": "Obviously AI",
      "ai-heavy": "AI-Heavy",
      mixed: "Mixed",
      "human-like": "Human-Like",
      indistinguishable: "Indistinguishable",
    };
    return labels[tier] || tier;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              humanize<span className="text-emerald-400">.ai</span>
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">Free. No account. No tracking.</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span className="hidden sm:inline">Powered by Llama 3.3 70B</span>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {/* Domain */}
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Domain</label>
            <div className="flex gap-1">
              {(["blog", "academic", "technical", "creative"] as Domain[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDomain(d)}
                  className={`px-3 py-1.5 text-xs rounded-md transition ${
                    domain === d
                      ? "bg-emerald-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Intensity */}
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Intensity</label>
            <div className="flex gap-1">
              {(["light", "medium", "aggressive"] as Intensity[]).map((i) => (
                <button
                  key={i}
                  onClick={() => setIntensity(i)}
                  className={`px-3 py-1.5 text-xs rounded-md transition ${
                    intensity === i
                      ? "bg-emerald-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  {i.charAt(0).toUpperCase() + i.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Detector Target */}
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Target Detector</label>
            <div className="flex gap-1 flex-wrap">
              {(["general", "gptzero", "originality", "turnitin"] as Detector[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDetector(d)}
                  className={`px-3 py-1.5 text-xs rounded-md transition ${
                    detector === d
                      ? "bg-emerald-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  {d === "general" ? "All" : d === "gptzero" ? "GPTZero" : d === "originality" ? "Originality" : "Turnitin"}
                </button>
              ))}
            </div>
          </div>

          {/* Multi-pass */}
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Mode</label>
            <button
              onClick={() => setMultiPass(!multiPass)}
              className={`px-3 py-1.5 text-xs rounded-md transition ${
                multiPass
                  ? "bg-amber-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {multiPass ? "Multi-Pass (3x)" : "Single Pass"}
            </button>
          </div>
        </div>

        {/* Editor Area */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Input */}
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-zinc-300">AI Text (Input)</label>
              <span className="text-xs text-zinc-500">{input.length} chars</span>
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste your AI-generated text here..."
              className="w-full h-80 bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-sm text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-emerald-600/50 focus:ring-1 focus:ring-emerald-600/20 transition font-mono"
            />
          </div>

          {/* Output */}
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-zinc-300">Humanized Text (Output)</label>
              {output && (
                <button
                  onClick={handleCopy}
                  className="text-xs text-emerald-400 hover:text-emerald-300 transition"
                >
                  Copy
                </button>
              )}
            </div>
            <textarea
              value={output}
              readOnly
              placeholder="Humanized text will appear here..."
              className="w-full h-80 bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-sm text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none transition font-mono"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3 mb-8">
          <button
            onClick={handleDetect}
            disabled={detecting || !input.trim()}
            className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-600 text-sm rounded-lg transition flex items-center gap-2"
          >
            {detecting ? (
              <>
                <div className="w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                Scanning...
              </>
            ) : (
              "Scan for AI"
            )}
          </button>
          <button
            onClick={handleRewrite}
            disabled={loading || !input.trim()}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900 disabled:text-emerald-700 text-sm font-medium rounded-lg transition flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-emerald-300 border-t-transparent rounded-full animate-spin" />
                Humanizing...
              </>
            ) : (
              "Humanize"
            )}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-950/50 border border-red-900 rounded-lg text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Detection Results */}
        {detection && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 mb-6">
            <h2 className="text-sm font-semibold text-zinc-300 mb-4">Detection Analysis</h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="text-center">
                <div className={`text-3xl font-bold ${scoreColor(detection.humanScore)}`}>
                  {detection.humanScore}
                </div>
                <div className="text-xs text-zinc-500 mt-1">Human Score /10</div>
              </div>
              <div className="text-center">
                <div className={`text-3xl font-bold ${detection.isAiGenerated ? "text-red-400" : "text-green-400"}`}>
                  {detection.isAiGenerated ? "AI" : "Human"}
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  {Math.round(detection.confidence * 100)}% confidence
                </div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-zinc-300">
                  {tierLabel(detection.patternAnalysis.tier)}
                </div>
                <div className="text-xs text-zinc-500 mt-1">Classification</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-zinc-300">
                  {detection.patternAnalysis.stats.aiPatternCount}
                </div>
                <div className="text-xs text-zinc-500 mt-1">AI Patterns Found</div>
              </div>
            </div>

            {/* Detailed Scores */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Perplexity", value: detection.detectorScores.perplexity },
                { label: "Burstiness", value: detection.detectorScores.burstiness },
                { label: "Vocabulary", value: detection.detectorScores.vocabularyRichness },
                { label: "Structure", value: detection.detectorScores.structuralVariety },
              ].map((s) => (
                <div key={s.label} className="bg-zinc-800/50 rounded-lg p-3">
                  <div className="text-xs text-zinc-500 mb-1">{s.label}</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-zinc-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          s.value >= 60 ? "bg-green-500" : s.value >= 40 ? "bg-yellow-500" : "bg-red-500"
                        }`}
                        style={{ width: `${s.value}%` }}
                      />
                    </div>
                    <span className="text-xs text-zinc-400 w-8 text-right">{s.value}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Pattern Matches */}
            {detection.patternAnalysis.matches.length > 0 && (
              <div className="mt-4">
                <div className="text-xs text-zinc-500 mb-2">Flagged Patterns</div>
                <div className="flex flex-wrap gap-1.5">
                  {detection.patternAnalysis.matches.slice(0, 20).map((m, i) => (
                    <span
                      key={i}
                      className={`text-xs px-2 py-0.5 rounded ${
                        m.tier === 1
                          ? "bg-red-900/50 text-red-300"
                          : m.tier === 2
                          ? "bg-orange-900/50 text-orange-300"
                          : "bg-yellow-900/50 text-yellow-300"
                      }`}
                    >
                      &quot;{m.match}&quot;
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Result Info */}
        {result && (
          <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
            <span>Passes: {result.passes}</span>
            <span>Model: {result.model}</span>
            <span>Input: {result.originalLength} chars</span>
            <span>Output: {result.rewrittenLength} chars</span>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 mt-16">
        <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-600">
          <span>No data stored. No tracking. No accounts. 100% free.</span>
          <span>Built with Llama 3.3 70B via NVIDIA NIM</span>
        </div>
      </footer>
    </div>
  );
}
