// Detection engine — classifies text as AI or human
// Uses pattern scoring + optional LLM-based classification via NVIDIA NIM

import { scanText, ScanResult } from "./patterns";

export interface DetectionResult {
  isAiGenerated: boolean;
  confidence: number; // 0-1
  humanScore: number; // 0-10
  patternAnalysis: ScanResult;
  detectorScores: {
    perplexity: number;
    burstiness: number;
    vocabularyRichness: number;
    structuralVariety: number;
  };
}

// Calculate perplexity approximation (how predictable the text is)
function estimatePerplexity(text: string): number {
  const words = text.toLowerCase().split(/\s+/);
  const bigrams: Map<string, number> = new Map();

  for (let i = 0; i < words.length - 1; i++) {
    const bigram = `${words[i]} ${words[i + 1]}`;
    bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
  }

  // More unique bigrams = higher perplexity = more human
  const uniqueRatio = bigrams.size / (words.length || 1);

  // Normalize to 0-100 (higher = more human)
  return Math.min(100, Math.round(uniqueRatio * 150));
}

// Calculate burstiness (sentence length variation)
function estimateBurstiness(text: string): number {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (sentences.length < 3) return 50;

  const lengths = sentences.map((s) => s.trim().split(/\s+/).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance =
    lengths.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) / lengths.length;
  const stdDev = Math.sqrt(variance);

  // Higher std dev = more bursty = more human
  // Normalize: stdDev of 5+ is very human, <2 is very AI
  const burstiness = Math.min(100, Math.round((stdDev / 6) * 100));
  return burstiness;
}

// Vocabulary richness (type-token ratio)
function estimateVocabularyRichness(text: string): number {
  const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const uniqueWords = new Set(words);
  const ttr = uniqueWords.size / (words.length || 1);

  // TTR of 0.5+ is rich, <0.35 is repetitive
  return Math.min(100, Math.round(ttr * 150));
}

// Structural variety (paragraph + sentence diversity)
function estimateStructuralVariety(text: string): number {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  if (paragraphs.length < 2) return 40;

  const paraLengths = paragraphs.map((p) => p.split(/\s+/).length);
  const paraVariance =
    paraLengths.reduce((sum, l) => sum + Math.pow(l - 100, 2), 0) /
    paraLengths.length;

  // Mix of short and long paragraphs = more human
  const shortParas = paraLengths.filter((l) => l < 30).length;
  const longParas = paraLengths.filter((l) => l > 80).length;
  const diversity = (shortParas + longParas) / paraLengths.length;

  return Math.min(100, Math.round(diversity * 100 + 20));
}

export function detectText(text: string): DetectionResult {
  const patternAnalysis = scanText(text);

  const perplexity = estimatePerplexity(text);
  const burstiness = estimateBurstiness(text);
  const vocabularyRichness = estimateVocabularyRichness(text);
  const structuralVariety = estimateStructuralVariety(text);

  // Weighted average of all signals
  const compositeScore =
    perplexity * 0.3 +
    burstiness * 0.25 +
    vocabularyRichness * 0.2 +
    structuralVariety * 0.1 +
    patternAnalysis.score * 10 * 0.15;

  const humanScore = Math.round((compositeScore / 10) * 10) / 10;
  const isAiGenerated = compositeScore < 50;
  const confidence = isAiGenerated
    ? Math.round((1 - compositeScore / 100) * 100) / 100
    : Math.round((compositeScore / 100) * 100) / 100;

  return {
    isAiGenerated,
    confidence: Math.min(0.99, Math.max(0.01, confidence)),
    humanScore: Math.min(10, Math.max(0, humanScore)),
    patternAnalysis,
    detectorScores: {
      perplexity,
      burstiness,
      vocabularyRichness,
      structuralVariety,
    },
  };
}
