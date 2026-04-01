// Detection engine — calibrated against real AI detectors
// Uses pattern scoring + statistical analysis

import { scanText, ScanResult } from "./patterns";

export interface DetectionResult {
  isAiGenerated: boolean;
  confidence: number; // 0-1
  humanScore: number; // 0-10
  aiScore: number; // 0-100
  patternAnalysis: ScanResult;
  detectorScores: {
    perplexity: number;
    burstiness: number;
    vocabularyRichness: number;
    structuralVariety: number;
  };
}

// Perplexity — how predictable are word choices?
function estimatePerplexity(text: string): number {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  if (words.length < 10) return 50;

  const bigrams: Map<string, number> = new Map();
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = `${words[i]} ${words[i + 1]}`;
    bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
  }

  // Count repeated bigrams — AI repeats more
  const repeatedBigrams = Array.from(bigrams.values()).filter(c => c > 1).length;
  const repeatRatio = repeatedBigrams / bigrams.size;

  // Lower repeat ratio = more human (higher perplexity)
  // AI: 0.3-0.5 repeat ratio. Human: 0.05-0.2
  const score = Math.max(0, Math.min(100, 100 - (repeatRatio * 200)));
  return Math.round(score);
}

// Burstiness — sentence length variation
function estimateBurstiness(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length < 3) return 40;

  const lengths = sentences.map(s => s.trim().split(/\s+/).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) / lengths.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean; // coefficient of variation

  // Human: cv 0.4-0.8. AI: cv 0.15-0.35
  const score = Math.max(0, Math.min(100, (cv - 0.15) / 0.65 * 100));
  return Math.round(score);
}

// Vocabulary richness
function estimateVocabularyRichness(text: string): number {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (words.length < 10) return 50;

  const uniqueWords = new Set(words);
  const ttr = uniqueWords.size / words.length;

  // Hapax legomena (words appearing only once)
  const freq: Map<string, number> = new Map();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  const hapax = Array.from(freq.values()).filter(c => c === 1).length;
  const hapaxRatio = hapax / words.length;

  // Human: TTR 0.5-0.7, hapax 0.4-0.6
  // AI: TTR 0.35-0.5, hapax 0.25-0.4
  const score = (ttr * 50 + hapaxRatio * 50) * 1.6;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// Structural variety
function estimateStructuralVariety(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length < 3) return 40;

  // Opening word variety
  const openings = sentences.map(s => s.trim().split(/\s+/)[0]?.toLowerCase() || "");
  const uniqueOpenings = new Set(openings);
  const openingRatio = uniqueOpenings.size / openings.length;

  // Sentence type variety (declarative, interrogative, exclamatory, fragment)
  const types = {
    questions: sentences.filter(s => s.trim().endsWith("?")).length,
    exclamations: sentences.filter(s => s.trim().endsWith("!")).length,
    fragments: sentences.filter(s => s.trim().split(/\s+/).length < 5).length,
    long: sentences.filter(s => s.trim().split(/\s+/).length > 20).length,
  };
  const variety = (types.questions + types.exclamations + types.fragments + types.long) / sentences.length;

  // AI writes more uniform; humans vary more
  const score = openingRatio * 60 + variety * 40;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// Contraction rate
function contractionRate(text: string): number {
  const contractions = text.match(/\b\w+('t|'re|'s|'ve|'d|'ll|'m)\b/gi) || [];
  const words = text.split(/\s+/).length;
  return contractions.length / (words || 1);
}

// AI style markers
const AI_MARKERS = [
  /^(in|at|with) (today's|the) /i,
  /^it (is|was) (important|crucial|essential|worth)/i,
  /^when it comes to/i,
  /^there (is|are) (a |several |many |numerous )/i,
  /it('s| is) (worth )?(noting|mentioning|pointing out)/i,
  /it('s| is) important to (note|remember|understand)/i,
  /this (means|suggests|implies|indicates) (that )?/i,
  /in (other words|this context|this regard)/i,
  /^(first|second|third|firstly|secondly|thirdly)[,.]/i,
  /^(overall|ultimately|essentially|fundamentally)[,.]/i,
  /(plays?|has|have) a (crucial|vital|key|significant|pivotal) role/i,
  /(one of )?(the )?(most|key|critical|vital|essential) (important|significant)/i,
];

function countAIMarkers(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  let count = 0;
  for (const sent of sentences) {
    for (const pat of AI_MARKERS) {
      if (pat.test(sent.trim())) { count++; break; }
    }
  }
  return count;
}

export function detectText(text: string): DetectionResult {
  const patternAnalysis = scanText(text);
  const perplexity = estimatePerplexity(text);
  const burstiness = estimateBurstiness(text);
  const vocabularyRichness = estimateVocabularyRichness(text);
  const structuralVariety = estimateStructuralVariety(text);

  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const styleMarkers = countAIMarkers(text);
  const styleRatio = sentences.length > 0 ? styleMarkers / sentences.length : 0;
  const contractions = contractionRate(text);
  const lowContractions = text.length > 200 && contractions < 0.015;

  // Pattern tier counts
  const tier1 = patternAnalysis.matches.filter(m => m.tier === 1).length;
  const tier2 = patternAnalysis.matches.filter(m => m.tier === 2).length;
  const tier3 = patternAnalysis.matches.filter(m => m.tier === 3).length;

  // === COMPOSITE AI SCORE ===
  // Start from statistical signals (50% weight)
  const statScore = (100 - perplexity) * 0.3 + (100 - burstiness) * 0.25 + (100 - vocabularyRichness) * 0.25 + (100 - structuralVariety) * 0.2;
  
  // Pattern signals (50% weight)
  const patternScore = patternAnalysis.score * 10; // 0-100, lower = more AI
  const patternComponent = (100 - patternScore) * 0.5;

  let aiScore = statScore * 0.5 + patternComponent;

  // Boosts for strong AI signals
  if (tier1 >= 2) aiScore = Math.max(aiScore, 75);
  if (tier1 >= 4) aiScore = Math.max(aiScore, 85);
  if (tier1 >= 6) aiScore = Math.max(aiScore, 92);
  if (styleRatio > 0.25) aiScore = Math.min(100, aiScore + 8);
  if (styleRatio > 0.4) aiScore = Math.min(100, aiScore + 8);
  if (lowContractions) aiScore = Math.min(100, aiScore + 5);

  // Penalties for human signals
  if (burstiness > 50) aiScore = Math.max(0, aiScore - 5);
  if (perplexity > 60) aiScore = Math.max(0, aiScore - 5);
  if (contractions > 0.03) aiScore = Math.max(0, aiScore - 5);

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
    detectorScores: { perplexity, burstiness, vocabularyRichness, structuralVariety },
  };
}
