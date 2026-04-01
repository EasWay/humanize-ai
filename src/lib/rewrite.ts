// Humanization engine v4 — Adversarial NLP techniques
// Techniques: persona injection, recursive paraphrasing, token perturbation,
// structural evasion, statistical fingerprint disruption

const NVIDIA_API_BASE = "https://integrate.api.nvidia.com/v1";

export interface RewriteOptions {
  text: string;
  domain: "academic" | "blog" | "technical" | "creative";
  intensity: "light" | "medium" | "aggressive";
}

export interface RewriteResult {
  original: string;
  rewritten: string;
  passes: number;
  model: string;
  layersApplied: string[];
}

// ============================================
// PERSONA TEMPLATES — Different voices defeat detectors
// ============================================

const PERSONAS = [
  // Casual blogger
  `You're a casual blogger writing from experience. You use slang, contractions, and personal anecdotes. You write like you're talking to a friend over coffee. Short paragraphs. Lots of "I think" and "honestly" and "you know." You go on small tangents. You use "lol" sometimes.`,
  // Non-native English speaker
  `You're writing as a non-native English speaker who's fluent but has slight quirks. Occasionally you use slightly unusual phrasing or word order. You're direct and to the point. You sometimes skip articles ("the", "a"). Your vocabulary is good but not fancy.`,
  // Technical professional
  `You're a senior technical professional writing an internal memo. You use industry jargon naturally. You're concise because you're busy. You use bullet points. You don't waste words. You abbreviate. You use passive voice occasionally for technical descriptions.`,
  // Journalist
  `You're an experienced journalist. You write tight, active-voice prose. You use quotes and specific details. You vary sentence length for rhythm. You never use cliches. You show, don't tell. You use em dashes sparingly — for asides only.`,
  // Academic researcher
  `You're a PhD researcher writing for a peer-reviewed journal. You use precise technical vocabulary. You cite specific studies. You use passive voice in methods sections. You're formal but not robotic. You avoid hedging language.`,
  // Creative writer
  `You're a creative writer with a distinctive voice. You use sensory details. You break grammar rules intentionally for effect. You use fragments. You vary rhythm dramatically. You use metaphors but not clichés. You have opinions.`,
];

const PERSONA_PROMPT = `You rewrite text so it passes AI detectors. Output ONLY the rewritten text.

Use this writing persona:
`;

const BASE_RULES = `
RULES:
- Keep the same meaning and roughly the same length
- Use contractions (don't, can't, it's, you're, I've)
- Never use: furthermore, moreover, additionally, delve, tapestry, landscape, navigate, leverage, streamline, empower, pivotal, crucial, vital, holistic, multifaceted, paradigm, foster, harness, comprehensive, robust, seamless, cutting-edge, state-of-the-art, in today's, it is important to, plays a role, game-changer
- Vary sentence length wildly (some 3 words, some 30)
- Add specific details, numbers, names
- The text must have HIGH PERPLEXITY (unpredictable word choices)
- The text must have HIGH BURSTINESS (wild sentence length variation)
- Write SHORT paragraphs (1-3 sentences)
- Break symmetrical patterns`;

// ============================================
// LAYER 1: Persona-based LLM Rewrite
// ============================================

async function llmRewrite(text: string, apiKey: string, persona?: string): Promise<string> {
  const charCount = text.length;
  const selectedPersona = persona || PERSONAS[Math.floor(Math.random() * PERSONAS.length)];
  const systemPrompt = PERSONA_PROMPT + selectedPersona + BASE_RULES;

  const response = await fetch(`${NVIDIA_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "meta/llama-3.3-70b-instruct",
      messages: [
        { role: "system", content: systemPrompt },
        { 
          role: "user", 
          content: `Rewrite this text. IMPORTANT: Your output MUST be between ${Math.floor(charCount * 0.8)} and ${Math.ceil(charCount * 1.1)} characters. Do NOT expand. Do NOT add citations or references. Keep it tight.\n\n${text}` 
        },
      ],
      temperature: 0.95,
      max_tokens: Math.min(4096, Math.ceil(charCount * 1.4)),
      top_p: 0.87,
      frequency_penalty: 0.85,
      presence_penalty: 0.6,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`NVIDIA API error: ${response.status} — ${err}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content?.trim() || text;
}

// ============================================
// LAYER 2: Recursive Paraphrasing
// ============================================

// Pass text through a second specialized paraphrase model
// This disrupts stylistic watermarks from the first pass
async function recursiveParaphrase(text: string, apiKey: string): Promise<string> {
  const charCount = text.length;
  const paraphrasePrompt = `You are a text paraphraser. Rewrite the text with completely different words and structures.

CRITICAL: Output MUST be between ${Math.floor(charCount * 0.85)} and ${charCount} characters. Do NOT expand. Do NOT add anything.

Rules:
- Different vocabulary (less common synonyms)
- Restructure sentences (active↔passive)
- Reorder ideas within paragraphs
- Keep the same meaning
- Keep the same length or SHORTER
- Output ONLY the rewritten text`;

  const response = await fetch(`${NVIDIA_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "meta/llama-3.1-8b-instruct", // Different model = different fingerprint
      messages: [
        { role: "system", content: paraphrasePrompt },
        { role: "user", content: text },
      ],
      temperature: 0.9,
      max_tokens: Math.min(4096, Math.ceil(text.length * 1.3)),
      top_p: 0.85,
    }),
  });

  if (!response.ok) return text; // Fallback — don't fail the whole pipeline

  const data = await response.json();
  return data.choices[0]?.message?.content?.trim() || text;
}

// ============================================
// LAYER 3: Token-Level Perturbation
// ============================================

// Replace high-confidence words with less probable synonyms
// This targets the token probability distribution that detectors analyze
const PERTURBATION_MAP: Record<string, string[]> = {
  // Common words → less probable alternatives
  "important": ["massive", "sizable", "weighty", "notable", "marked"],
  "helps": ["pushes", "gets you there", "moves things along", "does the heavy lifting"],
  "significant": ["enormous", "wild", "jarring", "night-and-day", "not even close"],
  "shows": ["lays bare", "puts on display", "makes plain", "drives home"],
  "improves": ["sharpens", "tightens", "gives an edge", "levels up", "polishes"],
  "increases": ["pumps up", "pushes higher", "ramps up", "drives up", "climbs"],
  "provides": ["hands over", "sets up with", "puts in your hands", "delivers"],
  "requires": ["demands", "calls for", "needs badly", "can't go without"],
  "understands": ["grasps", "gets", "sees clearly", "has a handle on"],
  "considers": ["thinks about", "sits with", "mulls over", "weighs"],
  "develops": ["builds out", "grows", "puts together", "crafts"],
  "creates": ["whips up", "builds from scratch", "puts together", "concocts"],
  "achieves": ["hits", "reaches", "pulls off", "lands"],
  "ensures": ["makes sure", "locks in", "guarantees"],
  "facilitates": ["makes easier", "smooths the way", "opens doors for", "clears the path"],
  "optimizes": ["fine-tunes", "dials in", "squeezes more out of"],
  "implements": ["rolls out", "puts in place", "gets running", "sets in motion"],
  "demonstrates": ["shows clearly", "proves", "lays out", "drives home"],
  "enables": ["opens the door for", "sets the stage for", "makes possible"],
  "establishes": ["sets up", "puts down roots", "builds the foundation for"],
  // Connector words
  "however": ["but", "though", "still", "yet", "that said"],
  "therefore": ["so", "which means", "that's why", "end result"],
  "consequently": ["so", "because of that", "which led to"],
  "subsequently": ["after that", "then", "down the line", "next up"],
  "meanwhile": ["at the same time", "in the background", "while that's happening"],
};

function perturbTokens(text: string): string {
  let result = text;
  
  for (const [word, alternatives] of Object.entries(PERTURBATION_MAP)) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    result = result.replace(regex, () => {
      return alternatives[Math.floor(Math.random() * alternatives.length)];
    });
  }

  return result;
}

// ============================================
// LAYER 4: Structural Evasion
// ============================================

function structuralEvasion(text: string): string {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  if (sentences.length < 3) return text;

  const result: string[] = [];

  for (let i = 0; i < sentences.length; i++) {
    let sent = sentences[i].trim();
    const words = sent.split(/\s+/);

    // Split long sentences at random points (15%)
    if (words.length > 15 && Math.random() < 0.15) {
      const splitAt = Math.floor(words.length * (0.3 + Math.random() * 0.3));
      result.push(words.slice(0, splitAt).join(" ").replace(/[.!?]$/, "") + ".");
      result.push(words.slice(splitAt).join(" "));
      continue;
    }

    // Merge short adjacent sentences (10%)
    if (words.length < 7 && i < sentences.length - 1) {
      const next = sentences[i + 1]?.trim() || "";
      if (next.split(/\s+/).length < 7 && Math.random() < 0.1) {
        sent = sent.replace(/[.!?]$/, "") + ", and " + next.charAt(0).toLowerCase() + next.slice(1);
        i++;
      }
    }

    // Insert fragment openers (8%)
    if (Math.random() < 0.08 && words.length > 6) {
      const openers = ["Look. ", "Here's the thing. ", "Real talk. ", "Honestly? ", "No joke. "];
      sent = openers[Math.floor(Math.random() * openers.length)] + sent;
    }

    result.push(sent);
  }

  return result.join(" ");
}

// ============================================
// LAYER 5: Post-processing
// ============================================

function postProcess(text: string): string {
  let result = text;

  // Force contractions
  const contractions: [RegExp, string][] = [
    [/\bdo not\b/gi, "don't"],
    [/\bdoes not\b/gi, "doesn't"],
    [/\bdid not\b/gi, "didn't"],
    [/\bcannot\b/gi, "can't"],
    [/\bwill not\b/gi, "won't"],
    [/\bwould not\b/gi, "wouldn't"],
    [/\bshould not\b/gi, "shouldn't"],
    [/\bcould not\b/gi, "couldn't"],
    [/\bit is\b/gi, "it's"],
    [/\bthat is\b/gi, "that's"],
    [/\bthey are\b/gi, "they're"],
    [/\bwe are\b/gi, "we're"],
    [/\byou are\b/gi, "you're"],
    [/\bI am\b/gi, "I'm"],
    [/\bI have\b/gi, "I've"],
    [/\byou have\b/gi, "you've"],
    [/\bthey have\b/gi, "they've"],
    [/\bwe have\b/gi, "we've"],
    [/\blet us\b/gi, "let's"],
  ];

  for (const [pattern, replacement] of contractions) {
    result = result.replace(pattern, replacement);
  }

  // Kill remaining AI phrases
  const kill = [
    /\bin today's (?:rapidly evolving|fast-paced|ever-changing|modern|competitive) (?:digital |technological |business )?(?:world|landscape|era)[,.]?\s*/gi,
    /\bit (?:is|was) (?:important|crucial|essential|worth noting|imperative) to (?:note|understand|remember)[,.]?\s*/gi,
    /\bplays? a (?:crucial|vital|key|pivotal|significant) role\b/gi,
    /\bin (?:conclusion|summary|essence)[,.]?\s/gi,
    /\bfurthermore[,.]?\s/gi,
    /\bmoreover[,.]?\s/gi,
    /\badditionally[,.]?\s/gi,
  ];

  for (const pattern of kill) {
    result = result.replace(pattern, "");
  }

  result = result.replace(/  +/g, " ");
  result = result.replace(/^[,.]\s*/, "");
  return result.trim();
}

// ============================================
// MAIN EXPORTS
// ============================================

export async function rewriteText(options: RewriteOptions): Promise<RewriteResult> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY not configured");

  const layersApplied: string[] = [];

  // Layer 1: Persona-based LLM rewrite
  let text = await llmRewrite(options.text, apiKey);
  layersApplied.push("persona-rewrite");

  // Layer 2: Recursive paraphrasing (different model)
  if (options.intensity !== "light") {
    text = await recursiveParaphrase(text, apiKey);
    layersApplied.push("recursive-paraphrase");
  }

  // Layer 3: Token perturbation
  text = perturbTokens(text);
  layersApplied.push("token-perturbation");

  // Layer 4: Structural evasion
  if (options.intensity === "aggressive") {
    text = structuralEvasion(text);
    layersApplied.push("structural-evasion");
  }

  // Layer 5: Post-processing
  text = postProcess(text);
  layersApplied.push("post-processing");

  // Hard length cap — trim if output is more than 15% longer than input
  const maxLen = Math.ceil(options.text.length * 1.15);
  if (text.length > maxLen) {
    // Find the last sentence boundary within the limit
    const trimmed = text.slice(0, maxLen);
    const lastPeriod = Math.max(trimmed.lastIndexOf("."), trimmed.lastIndexOf("!"), trimmed.lastIndexOf("?"));
    if (lastPeriod > maxLen * 0.7) {
      text = trimmed.slice(0, lastPeriod + 1);
    } else {
      text = trimmed.trimEnd() + ".";
    }
    layersApplied.push("length-cap");
  }

  return {
    original: options.text,
    rewritten: text,
    passes: 1,
    model: "meta/llama-3.3-70b-instruct + meta/llama-3.1-8b-instruct",
    layersApplied,
  };
}

export async function rewriteIterative(
  options: RewriteOptions,
  maxPasses: number = 3
): Promise<RewriteResult> {
  let current = options.text;
  let passes = 0;
  const allLayers: string[] = [];

  for (let i = 0; i < maxPasses; i++) {
    passes++;
    const result = await rewriteText({ ...options, text: current });
    current = result.rewritten;
    allLayers.push(...result.layersApplied);

    const bannedWords = ["furthermore", "moreover", "additionally", "delve", "tapestry", "navigate", "leverage", "streamline", "robust", "comprehensive", "seamless", "pivotal", "crucial"];
    const hasBanned = bannedWords.some(w => new RegExp(`\\b${w}\\b`, "i").test(current));
    if (!hasBanned) break;
  }

  return {
    original: options.text,
    rewritten: current,
    passes,
    model: "meta/llama-3.3-70b-instruct + meta/llama-3.1-8b-instruct",
    layersApplied: [...new Set(allLayers)],
  };
}
