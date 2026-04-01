// Pattern scanner — detects AI writing tells
// Inspired by slopbuster's 100+ pattern taxonomy

export interface PatternMatch {
  pattern: string;
  category: string;
  tier: 1 | 2 | 3; // 1 = dead giveaway, 2 = suspicious, 3 = weak signal
  position: number;
  match: string;
}

export interface ScanResult {
  score: number; // 0-10 (10 = fully human)
  tier: "obvious-ai" | "ai-heavy" | "mixed" | "human-like" | "indistinguishable";
  matches: PatternMatch[];
  stats: {
    sentenceLengthVariance: number;
    avgSentenceLength: number;
    paragraphCount: number;
    contractionRate: number;
    aiPatternCount: number;
  };
}

// === TIER 1: Dead giveaways (3 points each) ===
const TIER1_PATTERNS: [string, string][] = [
  // Vocabulary
  ["\\bdelve(?:d|s)?\\b", "vocabulary"],
  ["\\btapestry\\b", "vocabulary"],
  ["\\bnavigate\\b.*\\blandscape\\b", "vocabulary"],
  ["\\bharness\\b.*\\b(power|potential)\\b", "vocabulary"],
  ["\\bunlock\\b.*\\bpotential\\b", "vocabulary"],
  ["\\bleverage\\b", "vocabulary"],
  ["\\bfoster\\b.*\\bgrowth\\b", "vocabulary"],
  ["\\bpivotal\\b.*\\b(moment|role|factor)\\b", "vocabulary"],
  ["\\bgame[- ]?changer\\b", "vocabulary"],
  ["\\bparadigm shift\\b", "vocabulary"],
  ["\\bmeticulous(?:ly)?\\b", "vocabulary"],
  ["\\bintricacies\\b", "vocabulary"],
  ["\\bunderpinning\\b", "vocabulary"],
  // Sycophancy
  ["great question", "sycophancy"],
  ["that's a great question", "sycophancy"],
  ["interesting question", "sycophancy"],
  ["absolutely[,!]", "sycophancy"],
  ["you're absolutely right", "sycophancy"],
  ["I appreciate your", "sycophancy"],
  // Chatbot artifacts
  ["I hope this helps", "chatbot"],
  ["I hope this (?:answer|response|explanation)", "chatbot"],
  ["let me know if you (?:need|have) (?:anything|more|further)", "chatbot"],
  ["don't hesitate to (?:ask|reach out|contact)", "chatbot"],
  ["as an AI", "chatbot"],
  ["as a (?:large )?language model", "chatbot"],
  ["I don't have personal", "chatbot"],
  ["I cannot (?:provide|offer|give)", "chatbot"],
  // Structure
  ["in (?:today's|the) (?:rapidly evolving|fast-paced|ever-changing|modern) (?:digital |technological |business )?(?:world|landscape|era)", "structure"],
  ["it's (?:important|crucial|essential|worth noting) to (?:note|understand|remember|acknowledge)", "structure"],
  ["plays? a (?:crucial|vital|key|pivotal|significant) role", "structure"],
  ["in conclusion", "structure"],
  ["to summarize", "structure"],
  ["in summary", "structure"],
  ["it is worth noting that", "structure"],
  // Hedging patterns (AI over-hedges)
  ["it is important to note that", "hedging"],
  ["it should be noted that", "hedging"],
  ["one might argue that", "hedging"],
];

// === TIER 2: Corporate tells (2 points each) ===
const TIER2_PATTERNS: [string, string][] = [
  ["\\bsynergy\\b", "corporate"],
  ["\\bsynergies\\b", "corporate"],
  ["\\butilize\\b", "corporate"],
  ["\\bimplementation\\b", "corporate"],
  ["\\bfacilitate\\b", "corporate"],
  ["\\bstreamline\\b", "corporate"],
  ["\\brobust\\b", "corporate"],
  ["\\bcomprehensive\\b", "corporate"],
  ["\\bseamless(?:ly)?\\b", "corporate"],
  ["\\bcutting[- ]?edge\\b", "corporate"],
  ["\\bstate[- ]?of[- ]?the[- ]?art\\b", "corporate"],
  ["\\bestablished\\b.*\\bnorm\\b", "corporate"],
  ["\\boptimize\\b", "corporate"],
  ["\\bscalable\\b", "corporate"],
  ["\\bactionable\\b", "corporate"],
  // Rule of three (AI loves listing exactly 3 things)
  ["\\b\\w+,\\s+\\w+,\\s+and\\s+\\w+\\b", "structure"],
  // Significance inflation
  ["\\bempowers?\\b", "corporate"],
  ["\\btransforms?\\b.*\\blandscape\\b", "corporate"],
  ["\\binnovative\\b.*\\bsolution\\b", "corporate"],
  ["\\bcutting[- ]?edge\\b.*\\btechnology\\b", "corporate"],
  // Passive voice overuse (AI uses more passive)
  ["\\bis (?:being |)(?:used|utilized|implemented|developed|created|established)\\b", "passive"],
  ["\\bcan be (?:seen|found|observed|noted)\\b", "passive"],
  // Symmetrical structures (AI loves balance)
  ["not only .{10,50} but also", "symmetry"],
  ["on one hand .{10,50} on the other hand", "symmetry"],
];

// === TIER 3: Weak signals (1 point each) ===
const TIER3_PATTERNS: [string, string][] = [
  ["\\badditionally\\b", "connector"],
  ["\\bfurthermore\\b", "connector"],
  ["\\bmoreover\\b", "connector"],
  ["\\bconsequently\\b", "connector"],
  ["\\bnevertheless\\b", "connector"],
  ["\\bnonetheless\\b", "connector"],
  ["\\bon the other hand\\b", "connector"],
  ["\\bin the realm of\\b", "vocabulary"],
  ["\\bmultifaceted\\b", "vocabulary"],
  ["\\bholistic(?:ally)?\\b", "vocabulary"],
  ["\\bnuanced\\b", "vocabulary"],
  ["\\bmyriad\\b", "vocabulary"],
  ["\\bplethora\\b", "vocabulary"],
  // Em dash overuse
  ["—{2,}", "punctuation"],
  // Hedging
  ["\\bit is worth\\b", "hedging"],
  ["\\bworth (?:noting|mentioning|considering|pointing out)\\b", "hedging"],
];

// Sentence-level structural patterns
function analyzeStructure(text: string): ScanResult["stats"] {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  const lengths = sentences.map((s) => s.trim().split(/\s+/).length);
  const avgLength = lengths.reduce((a, b) => a + b, 0) / (lengths.length || 1);
  const variance =
    lengths.reduce((sum, l) => sum + Math.pow(l - avgLength, 2), 0) /
    (lengths.length || 1);

  // Contraction detection
  const contractionPattern = /\b\w+'\w+\b/g;
  const contractions = text.match(contractionPattern) || [];
  const words = text.split(/\s+/).length;
  const contractionRate = contractions.length / (words || 1);

  return {
    sentenceLengthVariance: Math.round(variance * 100) / 100,
    avgSentenceLength: Math.round(avgLength * 10) / 10,
    paragraphCount: paragraphs.length,
    contractionRate: Math.round(contractionRate * 1000) / 1000,
    aiPatternCount: 0, // filled in by scanText
  };
}

export function scanText(text: string): ScanResult {
  const matches: PatternMatch[] = [];
  let totalDeduction = 0;

  function checkPatterns(patterns: [string, string][], tier: 1 | 2 | 3) {
    for (const [pattern, category] of patterns) {
      const regex = new RegExp(pattern, "gi");
      let match;
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          pattern,
          category,
          tier,
          position: match.index,
          match: match[0],
        });
        totalDeduction += tier === 1 ? 3 : tier === 2 ? 2 : 1;
      }
    }
  }

  checkPatterns(TIER1_PATTERNS, 1);
  checkPatterns(TIER2_PATTERNS, 2);
  checkPatterns(TIER3_PATTERNS, 3);

  // Structural analysis
  const stats = analyzeStructure(text);
  stats.aiPatternCount = matches.length;

  // Low variance = AI-like (too consistent)
  if (stats.sentenceLengthVariance < 20) totalDeduction += 2;

  // Very low contraction rate = AI-like
  if (stats.contractionRate < 0.01 && text.length > 200) totalDeduction += 2;

  // Calculate human score (0-10)
  const humanScore = Math.max(0, Math.min(10, 10 - totalDeduction * 0.3));

  // Determine tier
  let tier: ScanResult["tier"];
  if (humanScore <= 3) tier = "obvious-ai";
  else if (humanScore <= 5) tier = "ai-heavy";
  else if (humanScore <= 7) tier = "mixed";
  else if (humanScore <= 9) tier = "human-like";
  else tier = "indistinguishable";

  return {
    score: Math.round(humanScore * 10) / 10,
    tier,
    matches,
    stats,
  };
}
