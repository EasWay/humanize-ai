// Humanization engine v4 — Adversarial NLP techniques
// Techniques: persona injection, recursive paraphrasing, token perturbation,
// structural evasion, statistical fingerprint disruption

// Type declaration for Node.js process (server-side only)
declare const process: { env: Record<string, string | undefined> };

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
  // Casual texter
  `You're texting a friend about the topic. Short sentences. Simple words. No fancy vocabulary. You write like you talk — casual, direct, sometimes incomplete thoughts. You use "like", "stuff", "things", "kinda". You keep it real.`,
  // Straight talker
  `You're a straight-talking person who gets to the point. No fluff. Simple language a 10th grader could understand. Short sentences. You say what you mean without dressing it up. You use everyday words.`,
  // Storyteller
  `You tell stories the way people actually talk. You ramble a bit. You go off on tangents. You use simple words. You repeat yourself sometimes. You say "and then" and "so yeah". You're not trying to impress anyone.`,
  // Practical thinker
  `You're a practical person writing down your thoughts. Simple words. Short sentences. You think out loud. You say "honestly" and "I mean" naturally. You don't use big words when small ones work.`,
  // Casual explainer
  `You're explaining something to a friend who doesn't know the topic. Simple language. Everyday examples. No jargon. You keep it short and clear. You say "basically" and "basically what happens is".`,
];

const PERSONA_PROMPT = `You rewrite text so it passes AI detectors. Output ONLY the rewritten text.

Use this writing persona:
`;

const BASE_RULES = `
CRITICAL ANTI-DETECTION RULES:
- Keep the same meaning. Output length MUST be ${0.7}x to ${1.0}x the input length. Shorter is better.
- Use contractions everywhere (don't, can't, it's, you're, I've, we'll)
- NEVER use these words (dead AI tells): furthermore, moreover, additionally, delve, tapestry, landscape, navigate, leverage, streamline, empower, pivotal, crucial, vital, holistic, multifaceted, paradigm, foster, harness, comprehensive, robust, seamless, cutting-edge, state-of-the-art, in today's, it is important to, plays a role, game-changer, meticulous, intricacies, underpinning, hence, thus, consequently, while that's happening, here's the thing, truth be told, all things considered, at the end of the day, when it comes to
- NEVER start sentences with: Although, While, Despite, Whereas, Moreover, Furthermore, Additionally, Consequently
- NEVER use "what if" or speculative hypotheticals — detectors flag them
- NEVER write perfectly grammatically correct sentences — add comma splices, fragments, run-ons
- Vary sentence length WILDLY. Mix 3-word punches with 25+ word ramblers. Never have two similar-length sentences in a row.
- Vary sentence STRUCTURE. Don't use Subject-Verb-Object every time. Start with clauses, prepositions, questions, fragments.
- Write SHORT paragraphs (1-3 sentences). Vary paragraph lengths too.
- Include GENUINE grammatical imperfections: comma splices, dropped articles, starting with And/But
- Add specific real-world details, names, numbers, places
- Mix registers — formal words next to casual ones in the same paragraph
- Include one tangent or aside per paragraph
- Use unexpected word choices. Don't pick the obvious synonym.
- Break parallel structure deliberately
- Some paragraphs should be ONE sentence. Others should be rambling.
- Include questions that feel natural, not rhetorical
- Write like you're thinking out loud, not composing
- Do NOT inject filler words mechanically. They must flow naturally or not at all.
- Break grammar rules. Use fragments. Comma splices. Run-ons. Missing subjects. Like a real person texting.`;

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
// LAYER 3: Advanced Token-Level Perturbation
// ============================================

// Replace high-confidence words with less probable synonyms
// This targets the token probability distribution that detectors analyze
const PERTURBATION_MAP: Record<string, string[]> = {
  // Common words → less probable alternatives
  "important": ["massive", "sizable", "weighty", "notable", "marked", "big deal"],
  "helps": ["pushes", "gets you there", "moves things along", "does the heavy lifting", "nudges forward"],
  "significant": ["enormous", "wild", "jarring", "night-and-day", "not even close", "huge"],
  "shows": ["lays bare", "puts on display", "makes plain", "drives home", "reveals"],
  "improves": ["sharpens", "tightens", "gives an edge", "levels up", "polishes", "upgrades"],
  "increases": ["pumps up", "pushes higher", "ramps up", "drives up", "climbs", "boosts"],
  "provides": ["hands over", "sets up with", "puts in your hands", "delivers", "gives"],
  "requires": ["demands", "calls for", "needs badly", "can't go without", "takes"],
  "understands": ["grasps", "gets", "sees clearly", "has a handle on", "knows"],
  "considers": ["thinks about", "sits with", "mulls over", "weighs", "ponders"],
  "develops": ["builds out", "grows", "puts together", "crafts", "creates"],
  "creates": ["whips up", "builds from scratch", "puts together", "concocts", "makes"],
  "achieves": ["hits", "reaches", "pulls off", "lands", "gets to"],
  "ensures": ["makes sure", "locks in", "guarantees", "secures"],
  "facilitates": ["makes easier", "smooths the way", "opens doors for", "clears the path", "helps"],
  "optimizes": ["fine-tunes", "dials in", "squeezes more out of", "perfects"],
  "implements": ["rolls out", "puts in place", "gets running", "sets in motion", "deploys"],
  "demonstrates": ["shows clearly", "proves", "lays out", "drives home", "illustrates"],
  "enables": ["opens the door for", "sets the stage for", "makes possible", "allows"],
  "establishes": ["sets up", "puts down roots", "builds the foundation for", "creates"],
  // Connector words
  "however": ["but", "though", "still", "yet", "that said", "even so"],
  "therefore": ["so", "which means", "that's why", "end result", "thus"],
  "consequently": ["so", "because of that", "which led to", "as a result"],
  "subsequently": ["after that", "then", "down the line", "next up", "later"],
  "meanwhile": ["at the same time", "in the background", "while that's happening", "simultaneously"],
};

// Unicode homoglyph substitution (invisible to humans, disrupts token embeddings)
// This is a DEFENSIVE technique to understand how attackers bypass filters
const HOMOGLYPHS: Record<string, string[]> = {
  "a": ["а", "ɑ"], // Cyrillic a, Latin alpha
  "e": ["е", "ė"], // Cyrillic e, Latin e with dot
  "o": ["о", "ο"], // Cyrillic o, Greek omicron
  "i": ["і", "ı"], // Cyrillic i, Turkish dotless i
  "c": ["с", "ϲ"], // Cyrillic s, Greek lunate sigma
};

function perturbTokens(text: string, useHomoglyphs: boolean = false): string {
  let result = text;
  
  // Standard synonym replacement
  for (const [word, alternatives] of Object.entries(PERTURBATION_MAP)) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    result = result.replace(regex, () => {
      return alternatives[Math.floor(Math.random() * alternatives.length)];
    });
  }

  // Homoglyph injection (use sparingly - 2% of words)
  // This demonstrates how attackers evade embedding-based detectors
  if (useHomoglyphs) {
    const words = result.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      if (Math.random() < 0.02) { // 2% substitution rate
        for (const [char, replacements] of Object.entries(HOMOGLYPHS)) {
          if (words[i].includes(char) && Math.random() < 0.5) {
            const replacement = replacements[Math.floor(Math.random() * replacements.length)];
            words[i] = words[i].replace(new RegExp(char, 'g'), replacement);
            break;
          }
        }
      }
    }
    result = words.join(" ");
  }

  return result;
}

// ============================================
// LAYER 3.5: Embedding Space Perturbation
// ============================================

// Inject rare but contextually valid words to shift embedding centroid
// This targets classifier-based detectors that use sentence embeddings
const EMBEDDING_PERTURBATIONS: Record<string, string[]> = {
  // Inject domain-specific jargon that's rare in training data
  "general": ["frankly", "honestly", "look", "basically", "literally"],
  "academic": ["notably", "arguably", "ostensibly", "purportedly", "allegedly"],
  "technical": ["essentially", "fundamentally", "practically", "effectively", "virtually"],
  "creative": ["somehow", "perhaps", "maybe", "possibly", "seemingly"],
};

function injectEmbeddingNoise(text: string, domain: string): string {
  const sentences = text.split(/([.!?]+)/).filter(s => s.trim().length > 0);
  const perturbations = EMBEDDING_PERTURBATIONS[domain] || EMBEDDING_PERTURBATIONS["general"];
  
  for (let i = 0; i < sentences.length; i += 2) { // Every other sentence
    if (Math.random() < 0.3 && sentences[i].split(/\s+/).length > 8) {
      const words = sentences[i].split(/\s+/);
      const insertPos = Math.floor(Math.random() * (words.length - 2)) + 1;
      const noise = perturbations[Math.floor(Math.random() * perturbations.length)];
      words.splice(insertPos, 0, noise + ",");
      sentences[i] = words.join(" ");
    }
  }
  
  return sentences.join("");
}

// ============================================
// LAYER 3.7: Lexical Diversity Injection
// ============================================

// Inject rare words and idiomatic expressions to increase vocabulary richness
const RARE_EXPRESSIONS: Record<string, string[]> = {
  "very": ["incredibly", "remarkably", "exceptionally", "strikingly", "uncommonly"],
  "good": ["stellar", "exemplary", "first-rate", "top-notch", "ace"],
  "bad": ["abysmal", "dreadful", "atrocious", "woeful", "dire"],
  "big": ["colossal", "mammoth", "gargantuan", "titanic", "whopping"],
  "small": ["minuscule", "infinitesimal", "microscopic", "negligible", "paltry"],
  "many": ["myriad", "countless", "innumerable", "multitudinous", "copious"],
  "few": ["scant", "sparse", "meager", "paltry", "scarce"],
  "quickly": ["swiftly", "expeditiously", "posthaste", "forthwith", "pronto"],
  "slowly": ["sluggishly", "languidly", "leisurely", "unhurriedly", "gradually"],
};

// Idiomatic expressions that increase hapax legomena
const IDIOMS = [
  "truth be told", "all things considered", "at the end of the day",
  "when push comes to shove", "for what it's worth", "in a nutshell",
  "off the top of my head", "as far as I can tell", "if you ask me",
  "bottom line is", "long story short", "to be fair", "granted",
];

function injectLexicalDiversity(text: string): string {
  let result = text;

  // Replace common intensifiers with rare alternatives
  for (const [common, rare] of Object.entries(RARE_EXPRESSIONS)) {
    const regex = new RegExp(`\\b${common}\\b`, "gi");
    const matches = result.match(regex);
    if (matches && matches.length > 0) {
      // Replace 40% of occurrences
      let replacedCount = 0;
      result = result.replace(regex, (match) => {
        if (Math.random() < 0.4 && replacedCount < matches.length * 0.4) {
          replacedCount++;
          return rare[Math.floor(Math.random() * rare.length)];
        }
        return match;
      });
    }
  }

  // Inject idioms at sentence boundaries (20% chance)
  const sentences = result.split(/([.!?]+\s+)/);
  for (let i = 0; i < sentences.length; i += 2) {
    if (Math.random() < 0.2 && sentences[i].split(/\s+/).length > 10) {
      const idiom = IDIOMS[Math.floor(Math.random() * IDIOMS.length)];
      // Insert at beginning or after first clause
      if (Math.random() < 0.5) {
        sentences[i] = idiom.charAt(0).toUpperCase() + idiom.slice(1) + ", " + sentences[i];
      } else {
        const words = sentences[i].split(/\s+/);
        const insertPos = Math.floor(words.length * 0.3);
        words.splice(insertPos, 0, idiom + ",");
        sentences[i] = words.join(" ");
      }
    }
  }

  return sentences.join("");
}

// ============================================
// LAYER 4: Advanced Structural Evasion
// ============================================

function structuralEvasion(text: string): string {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  if (sentences.length < 3) return text;

  const result: string[] = [];

  for (let i = 0; i < sentences.length; i++) {
    let sent = sentences[i].trim();
    const words = sent.split(/\s+/);

    // Aggressive sentence length variation
    // Split long sentences at random points (25% - increased from 15%)
    if (words.length > 15 && Math.random() < 0.25) {
      const splitAt = Math.floor(words.length * (0.3 + Math.random() * 0.3));
      result.push(words.slice(0, splitAt).join(" ").replace(/[.!?]$/, "") + ".");
      result.push(words.slice(splitAt).join(" "));
      continue;
    }

    // Create micro-sentences (3-5 words) for extreme burstiness
    if (words.length > 12 && Math.random() < 0.15) {
      const microLength = 3 + Math.floor(Math.random() * 3);
      result.push(words.slice(0, microLength).join(" ") + ".");
      result.push(words.slice(microLength).join(" "));
      continue;
    }

    // Merge short adjacent sentences (15% - increased from 10%)
    if (words.length < 7 && i < sentences.length - 1) {
      const next = sentences[i + 1]?.trim() || "";
      if (next.split(/\s+/).length < 7 && Math.random() < 0.15) {
        const connectors = [", and ", " — ", "; ", ", but "];
        const connector = connectors[Math.floor(Math.random() * connectors.length)];
        sent = sent.replace(/[.!?]$/, "") + connector + next.charAt(0).toLowerCase() + next.slice(1);
        i++;
      }
    }

    // Insert fragment openers (12% - increased from 8%)
    if (Math.random() < 0.12 && words.length > 6) {
      const openers = [
        "Look. ", "Here's the thing. ", "Real talk. ", "Honestly? ", "No joke. ",
        "Listen. ", "Get this. ", "Check it out. ", "Thing is. ", "See, "
      ];
      sent = openers[Math.floor(Math.random() * openers.length)] + sent;
    }

    // Add parenthetical asides (10% chance) - increases syntactic complexity
    if (Math.random() < 0.1 && words.length > 10) {
      const asides = [
        "at least in my experience",
        "or so I've found",
        "from what I can tell",
        "if that makes sense",
        "which is interesting",
        "surprisingly enough",
      ];
      const aside = asides[Math.floor(Math.random() * asides.length)];
      const insertPos = Math.floor(words.length * 0.5);
      words.splice(insertPos, 0, `(${aside})`);
      sent = words.join(" ");
    }

    // Inject questions for variety (8% chance)
    if (Math.random() < 0.08 && words.length > 8 && !sent.includes("?")) {
      const questions = ["Right?", "You know?", "Make sense?", "See what I mean?"];
      sent = sent.replace(/\.$/, "") + ", " + questions[Math.floor(Math.random() * questions.length)].toLowerCase();
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
    /\bhence[,.]?\s/gi,
    /\bthus[,.]?\s/gi,
    /\bconsequently[,.]?\s/gi,
    /\bwhile that's happening[,.]?\s/gi,
    /\bhere's the thing:?\s/gi,
    /\btruth be told[,.]?\s/gi,
    /\ball things considered[,.]?\s/gi,
    /\bat the end of the day[,.]?\s/gi,
    /\bwhen it comes to\s/gi,
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

  // Layer 1: Persona-based LLM rewrite (does ALL the heavy lifting)
  let text = await llmRewrite(options.text, apiKey);
  layersApplied.push("persona-rewrite");

  // Layer 2: Recursive paraphrasing (different model = different fingerprint)
  if (options.intensity !== "light") {
    text = await recursiveParaphrase(text, apiKey);
    layersApplied.push("recursive-paraphrase");
  }

  // Layer 3: Basic cleanup only — no mechanical injection
  text = postProcess(text);
  layersApplied.push("post-processing");

  // Hard length cap — trim if output is more than 15% longer than input
  const maxLen = Math.ceil(options.text.length * 1.15);
  if (text.length > maxLen) {
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

    const bannedWords = ["furthermore", "moreover", "additionally", "delve", "tapestry", "navigate", "leverage", "streamline", "robust", "comprehensive", "seamless", "pivotal", "crucial", "hence", "thus"];
    const hasBanned = bannedWords.some(w => new RegExp(`\\b${w}\\b`, "i").test(current));
    if (!hasBanned) break;
  }

  return {
    original: options.text,
    rewritten: current,
    passes,
    model: "meta/llama-3.3-70b-instruct + meta/llama-3.1-8b-instruct",
    layersApplied: Array.from(new Set(allLayers)),
  };
}
