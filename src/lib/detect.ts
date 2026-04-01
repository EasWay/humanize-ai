// Detection engine — classifies text as AI or human
// Uses pattern scoring + statistical analysis

import { scanText, ScanResult } from "./patterns";

export interface DetectionResult {
  isAiGenerated: boolean;
  confidence: number; // 0-1
  humanScore: number; // 0-10
  aiScore: number; // 0-100 (percentage likelihood of AI)
  patternAnalysis: ScanResult;
  detectorScores: {
    perplexity: number;
    burstiness: number;
    vocabularyRichness: number;
    structuralVariety: number;
  };
}

// Calculate perplexity approximation
function estimatePerplexity(text: string): number {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  const bigrams: Map<string, number> = new Map();

  for (let i = 0; i < words.length - 1; i++) {
    const bigram = `${words[i]} ${words[i + 1]}`;
    bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
  }

  const uniqueRatio = bigrams.size / (words.length || 1);
  // Higher = more human. Scale: 0-100
  return Math.min(100, Math.round(uniqueRatio * 160));
}

// Calculate burstiness (sentence length variation)
function estimateBurstiness(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length < 3) return 50;

  const lengths = sentences.map(s => s.trim().split(/\s+/).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) / lengths.length;
  const stdDev = Math.sqrt(variance);

  // Humans: stdDev 4-8. AI: stdDev 1-3.
  return Math.min(100, Math.max(0, Math.round((stdDev / 7) * 100)));
}

// Vocabulary richness (type-token ratio with hapax legomena bonus)
function estimateVocabularyRichness(text: string): number {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (words.length < 10) return 50;

  const uniqueWords = new Set(words);
  const ttr = uniqueWords.size / words.length;

  // Count words that appear only once (hapax legomena) — humans use more unique words
  const freq: Map<string, number> = new Map();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  const hapax = Array.from(freq.values()).filter(c => c === 1).length;
  const hapaxRatio = hapax / words.length;

  // TTR: human 0.5-0.7, AI 0.35-0.5
  // Hapax: human 0.4-0.6, AI 0.25-0.4
  const score = (ttr * 60) + (hapaxRatio * 40);
  return Math.min(100, Math.max(0, Math.round(score * 130)));
}

// Structural variety
function estimateStructuralVariety(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);

  if (sentences.length < 3) return 50;

  // Check for sentence opening variety
  const openings = sentences.map(s => {
    const words = s.trim().split(/\s+/);
    return words[0]?.toLowerCase() || "";
  });
  const uniqueOpenings = new Set(openings);
  const openingVariety = uniqueOpenings.size / openings.length;

  // Check for paragraph length variety
  let paraVariety = 50;
  if (paragraphs.length >= 2) {
    const paraLengths = paragraphs.map(p => p.split(/\s+/).length);
    const maxLen = Math.max(...paraLengths);
    const minLen = Math.min(...paraLengths);
    paraVariety = maxLen > 0 ? Math.min(100, (minLen / maxLen) * 200) : 50;
    // Good mix = closer to 50. All same = closer to 100 (bad) or 0
    paraVariety = 100 - Math.abs(paraVariety - 50);
  }

  return Math.min(100, Math.max(0, Math.round(openingVariety * 60 + paraVariety * 0.4)));
}

// AI style markers — phrases and structures AI overuses
const AI_STYLE_MARKERS = [
  // Opening patterns
  /^(in|at|with) (today's|the) /i,
  /^(as|while) (we|you|they) /i,
  /^it (is|was) (important|crucial|essential|worth)/i,
  /^when it comes to/i,
  /^there (is|are) (a|several|many|numerous)/i,
  // Hedging patterns
  /it('s| is) (worth )?(noting|mentioning|pointing out|considering)/i,
  /it('s| is) important to (note|remember|understand|acknowledge)/i,
  /it should be (noted|mentioned|pointed out)/i,
  // Transitional AI patterns
  /this (means|suggests|implies|indicates) (that )?/i,
  /in (other words|this context|this regard)/i,
  /on the (other )?hand[,.]/i,
  /that (being )?said[,.]/i,
  // Generic openings
  /^(first|second|third|firstly|secondly|thirdly)[,.]/i,
  /^(overall|ultimately|essentially|fundamentally)[,.]/i,
  // Emphasis patterns
  /(one of )?(the )?(most|key|critical|vital|essential) (important|significant)/i,
  /(plays?|has|have) a (crucial|vital|key|significant|pivotal) role/i,
];

function countStyleMarkers(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  let count = 0;
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    for (const pattern of AI_STYLE_MARKERS) {
      if (pattern.test(trimmed)) {
        count++;
        break; // Count each sentence only once
      }
    }
  }
  return count;
}

// Contraction rate — humans use contractions much more
function contractionRate(text: string): number {
  const contractions = text.match(/\b\w+('t|'re|'s|'ve|'d|'ll|'m)\b/gi) || [];
  const words = text.split(/\s+/).length;
  return contractions.length / (words || 1);
}

export function detectText(text: string): DetectionResult {
  const patternAnalysis = scanText(text);

  const perplexity = estimatePerplexity(text);
  const burstiness = estimateBurstiness(text);
  const vocabularyRichness = estimateVocabularyRichness(text);
  const structuralVariety = estimateStructuralVariety(text);

  // Style marker analysis
  const styleMarkerCount = countStyleMarkers(text);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const styleMarkerRatio = sentences.length > 0 ? styleMarkerCount / sentences.length : 0;

  // Contraction analysis
  const contractionPct = contractionRate(text);
  const hasLowContractions = text.length > 200 && contractionPct < 0.01;

  // === PATTERN-BASED AI SCORE (dominant signal) ===
  // Pattern analysis already gives us a 0-10 score where 10 = human
  // Convert to 0-100 AI score (higher = more AI)
  let aiScore = 100 - (patternAnalysis.score * 10);

  // Boost AI score based on pattern density
  const tier1Count = patternAnalysis.matches.filter(m => m.tier === 1).length;
  const tier2Count = patternAnalysis.matches.filter(m => m.tier === 2).length;
  const tier3Count = patternAnalysis.matches.filter(m => m.tier === 3).length;

  // Each tier 1 pattern is a strong signal
  if (tier1Count >= 3) aiScore = Math.max(aiScore, 85);
  if (tier1Count >= 5) aiScore = Math.max(aiScore, 92);
  if (tier1Count >= 8) aiScore = Math.max(aiScore, 97);

  // Style markers boost
  if (styleMarkerRatio > 0.3) aiScore = Math.min(100, aiScore + 10);
  if (styleMarkerRatio > 0.5) aiScore = Math.min(100, aiScore + 10);

  // Low contractions boost (humains use contractions)
  if (hasLowContractions) aiScore = Math.min(100, aiScore + 5);

  // Low burstiness boost (AI is consistent)
  if (burstiness < 30) aiScore = Math.min(100, aiScore + 5);

  // Low perplexity boost (AI is predictable)
  if (perplexity < 50) aiScore = Math.min(100, aiScore + 5);

  // Cap and convert
  aiScore = Math.max(0, Math.min(100, Math.round(aiScore)));
  const humanScore = Math.round((10 - aiScore / 10) * 10) / 10;
  const isAiGenerated = aiScore >= 50;
  const confidence = aiScore >= 50
    ? Math.min(0.99, Math.max(0.50, aiScore / 100))
    : Math.min(0.99, Math.max(0.50, 1 - aiScore / 100));

  return {
    isAiGenerated,
    confidence: Math.round(confidence * 100) / 100,
    humanScore: Math.min(10, Math.max(0, humanScore)),
    aiScore,
    patternAnalysis,
    detectorScores: {
      perplexity,
      burstiness,
      vocabularyRichness,
      structuralVariety,
    },
  };
}
