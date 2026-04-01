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
    semanticCoherence: number;
    syntacticComplexity: number;
  };
  modelFingerprint?: {
    model: string;
    confidence: number;
  };
}

// Perplexity — how predictable are word choices?
// Enhanced with trigram analysis and entropy calculation
function estimatePerplexity(text: string): number {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  if (words.length < 10) return 50;

  // Bigram analysis
  const bigrams: Map<string, number> = new Map();
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = `${words[i]} ${words[i + 1]}`;
    bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
  }

  // Trigram analysis (more sensitive to AI patterns)
  const trigrams: Map<string, number> = new Map();
  for (let i = 0; i < words.length - 2; i++) {
    const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
    trigrams.set(trigram, (trigrams.get(trigram) || 0) + 1);
  }

  // Shannon entropy calculation
  const freq: Map<string, number> = new Map();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / words.length;
    entropy -= p * Math.log2(p);
  }
  const maxEntropy = Math.log2(words.length);
  const normalizedEntropy = entropy / maxEntropy;

  // Count repeated bigrams — AI repeats more
  const repeatedBigrams = Array.from(bigrams.values()).filter(c => c > 1).length;
  const repeatRatio = repeatedBigrams / bigrams.size;

  // Trigram uniqueness (AI has lower trigram diversity)
  const trigramUniqueness = trigrams.size / Math.max(1, words.length - 2);

  // Composite score
  // Lower repeat ratio = more human (higher perplexity)
  // AI: 0.3-0.5 repeat ratio. Human: 0.05-0.2
  const bigramScore = 100 - (repeatRatio * 200);
  const entropyScore = normalizedEntropy * 100;
  const trigramScore = trigramUniqueness * 120;

  const score = bigramScore * 0.4 + entropyScore * 0.3 + trigramScore * 0.3;
  return Math.max(0, Math.min(100, Math.round(score)));
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

// Semantic coherence — AI maintains unnaturally consistent topic focus
function estimateSemanticCoherence(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length < 3) return 50;

  // Topic shift detection via lexical overlap between adjacent sentences
  let totalOverlap = 0;
  for (let i = 0; i < sentences.length - 1; i++) {
    const words1 = new Set(sentences[i].toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const words2 = new Set(sentences[i + 1].toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const overlap = intersection.size / Math.max(words1.size, words2.size, 1);
    totalOverlap += overlap;
  }
  const avgOverlap = totalOverlap / (sentences.length - 1);

  // AI: 0.25-0.4 overlap (very coherent). Human: 0.1-0.25 (more tangential)
  // Higher overlap = more AI-like, so invert for human score
  const score = Math.max(0, Math.min(100, (0.4 - avgOverlap) / 0.3 * 100));
  return Math.round(score);
}

// Syntactic complexity — parse tree depth estimation via clause detection
function estimateSyntacticComplexity(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length < 3) return 50;

  let totalComplexity = 0;
  for (const sent of sentences) {
    // Count subordinating conjunctions and relative pronouns (clause markers)
    const clauseMarkers = sent.match(/\b(because|although|while|since|if|when|where|which|who|whom|whose|that)\b/gi) || [];
    // Count commas (rough proxy for embedded clauses)
    const commas = (sent.match(/,/g) || []).length;
    // Count parentheticals and em dashes
    const parentheticals = (sent.match(/\(|\)|—/g) || []).length;
    
    const complexity = clauseMarkers.length * 2 + commas + parentheticals * 1.5;
    totalComplexity += complexity;
  }

  const avgComplexity = totalComplexity / sentences.length;
  // AI: 1-3 complexity. Human: 2-6 complexity
  const score = Math.max(0, Math.min(100, (avgComplexity / 6) * 100));
  return Math.round(score);
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

// Model-specific fingerprinting — different models have distinct patterns
function detectModelFingerprint(text: string): { model: string; confidence: number } {
  const lower = text.toLowerCase();
  
  // GPT-4/ChatGPT fingerprints
  const gptSignals = [
    /\b(delve|tapestry|intricate|multifaceted)\b/gi,
    /it's worth noting/gi,
    /in today's (rapidly evolving|digital)/gi,
  ];
  const gptScore = gptSignals.reduce((sum, pat) => sum + (text.match(pat) || []).length, 0);
  
  // Claude fingerprints (more formal, uses "indeed", "notably")
  const claudeSignals = [
    /\b(indeed|notably|particularly|specifically)\b/gi,
    /it's important to (note|understand|recognize)/gi,
    /this (approach|method|strategy) (allows|enables)/gi,
  ];
  const claudeScore = claudeSignals.reduce((sum, pat) => sum + (text.match(pat) || []).length, 0);
  
  // Llama fingerprints (more casual, uses "basically", "essentially")
  const llamaSignals = [
    /\b(basically|essentially|fundamentally)\b/gi,
    /in (essence|summary|short)/gi,
    /the (key|main) (point|idea|concept) is/gi,
  ];
  const llamaScore = llamaSignals.reduce((sum, pat) => sum + (text.match(pat) || []).length, 0);
  
  const total = gptScore + claudeScore + llamaScore;
  if (total === 0) return { model: "unknown", confidence: 0 };
  
  const scores = [
    { model: "gpt", score: gptScore },
    { model: "claude", score: claudeScore },
    { model: "llama", score: llamaScore },
  ];
  
  const winner = scores.reduce((max, curr) => curr.score > max.score ? curr : max);
  return { model: winner.model, confidence: Math.min(0.9, winner.score / total) };
}

export function detectText(text: string): DetectionResult {
  const patternAnalysis = scanText(text);
  const perplexity = estimatePerplexity(text);
  const burstiness = estimateBurstiness(text);
  const vocabularyRichness = estimateVocabularyRichness(text);
  const structuralVariety = estimateStructuralVariety(text);
  const semanticCoherence = estimateSemanticCoherence(text);
  const syntacticComplexity = estimateSyntacticComplexity(text);

  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const styleMarkers = countAIMarkers(text);
  const styleRatio = sentences.length > 0 ? styleMarkers / sentences.length : 0;
  const contractions = contractionRate(text);
  const lowContractions = text.length > 200 && contractions < 0.015;

  // Pattern tier counts
  const tier1 = patternAnalysis.matches.filter(m => m.tier === 1).length;
  const tier2 = patternAnalysis.matches.filter(m => m.tier === 2).length;
  const tier3 = patternAnalysis.matches.filter(m => m.tier === 3).length;

  // === ENHANCED COMPOSITE AI SCORE ===
  // Statistical signals (45% weight) - now includes semantic and syntactic
  const statScore = 
    (100 - perplexity) * 0.25 + 
    (100 - burstiness) * 0.20 + 
    (100 - vocabularyRichness) * 0.20 + 
    (100 - structuralVariety) * 0.15 +
    (100 - semanticCoherence) * 0.10 +
    (100 - syntacticComplexity) * 0.10;
  
  // Pattern signals (55% weight) - increased importance
  const patternScore = patternAnalysis.score * 10; // 0-100, lower = more AI
  const patternComponent = (100 - patternScore) * 0.55;

  let aiScore = statScore * 0.45 + patternComponent;

  // Boosts for strong AI signals
  if (tier1 >= 2) aiScore = Math.max(aiScore, 75);
  if (tier1 >= 4) aiScore = Math.max(aiScore, 85);
  if (tier1 >= 6) aiScore = Math.max(aiScore, 92);
  if (styleRatio > 0.25) aiScore = Math.min(100, aiScore + 8);
  if (styleRatio > 0.4) aiScore = Math.min(100, aiScore + 8);
  if (lowContractions) aiScore = Math.min(100, aiScore + 5);

  // Enhanced penalties for human signals
  if (burstiness > 50) aiScore = Math.max(0, aiScore - 5);
  if (perplexity > 60) aiScore = Math.max(0, aiScore - 5);
  if (contractions > 0.03) aiScore = Math.max(0, aiScore - 5);
  if (semanticCoherence < 40) aiScore = Math.max(0, aiScore - 4); // Low coherence = human tangents
  if (syntacticComplexity > 60) aiScore = Math.max(0, aiScore - 4); // High complexity = human

  aiScore = Math.max(0, Math.min(100, Math.round(aiScore)));
  const humanScore = Math.round((10 - aiScore / 10) * 10) / 10;
  const isAiGenerated = aiScore >= 50;
  const confidence = aiScore >= 50
    ? Math.min(0.99, Math.max(0.50, aiScore / 100))
    : Math.min(0.99, Math.max(0.50, 1 - aiScore / 100));

  // Model fingerprinting
  const modelFingerprint = detectModelFingerprint(text);

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
      semanticCoherence,
      syntacticComplexity
    },
    modelFingerprint: modelFingerprint.confidence > 0.3 ? modelFingerprint : undefined,
  };
}
