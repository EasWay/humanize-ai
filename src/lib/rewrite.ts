// Multi-layer humanization engine
// Layer 1: LLM rewrite with anti-detection prompts
// Layer 2: Statistical fingerprint disruption
// Layer 3: Structural randomization  
// Layer 4: Post-processing cleanup

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
// LAYER 1: LLM Rewrite
// ============================================

const HUMANIZATION_SYSTEM = `You are rewriting text so it sounds like a real person typed it. NOT an AI. A real human.

CRITICAL RULES:
1. Output ONLY the rewritten text. No explanations.
2. Keep output roughly the same LENGTH as the input. Do NOT expand. Prefer to be slightly SHORTER.
3. Write like you're texting or emailing a friend about the topic.

HOW TO WRITE LIKE A HUMAN:
- Use contractions: don't, can't, won't, it's, that's, I've, you're, they're, we're
- Start sentences with: And, But, So, Look, Here's, Honestly, Basically, The thing is
- Mix sentence lengths wildly: some 3 words, some 30+ words
- Use informal words: stuff, thing, a lot, kind of, pretty much, basically
- Add personal voice: "I think", "honestly", "from what I've seen", "in my experience"
- Use em dashes — for asides and interruptions
- End with questions sometimes? Or fragments. Or just a short punch.
- Use specific examples instead of vague claims
- Make occasional comma splices, they're more human
- Use "I mean" and "you know" and "right?" naturally

NEVER USE THESE WORDS/PHRASES (they are AI tells):
delve, tapestry, landscape, navigate, furthermore, moreover, additionally, 
comprehensive, robust, seamless, leverage, streamline, empower, pivotal, 
crucial, vital, holistic, multifaceted, paradigm, foster, harness, realm,
unlock potential, cutting-edge, state-of-the-art, game-changer, in conclusion,
it is important/crucial/essential to, plays a crucial/vital/pivotal role,
in today's rapidly evolving, it's worth noting, that being said, nevertheless,
nonetheless, consequently, furthermore, on the other hand, in other words

NEVER start with "In today's [anything]".
NEVER use the rule of three (listing exactly 3 things).
NEVER write perfectly symmetrical paragraphs.
NEVER use "Additionally" or "Furthermore" as connectors.

The rewritten text should be UNDETECTABLE by AI detectors like GPTZero, 
Originality.ai, and Turnitin. It must read like a human wrote it — 
messy, opinionated, with personality.`;

async function llmRewrite(text: string, apiKey: string): Promise<string> {
  const charCount = text.length;
  
  const response = await fetch(`${NVIDIA_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "meta/llama-3.3-70b-instruct",
      messages: [
        { role: "system", content: HUMANIZATION_SYSTEM },
        { 
          role: "user", 
          content: `Rewrite this text (${charCount} chars). Keep the output close to the same length. Make it sound like a real person wrote it:\n\n${text}` 
        },
      ],
      temperature: 0.95,
      max_tokens: Math.min(4096, Math.ceil(charCount * 1.5)),
      top_p: 0.85,
      frequency_penalty: 0.8,
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
// LAYER 2: Statistical Fingerprint Disruption
// ============================================

const VOCABULARY_DISRUPTION: [RegExp, string[]][] = [
  [/\bvery\b/gi, ["really", "super", "incredibly", "remarkably", ""]],
  [/\bimportant\b/gi, ["key", "huge", "massive", "big deal"]],
  [/\bhowever\b/gi, ["but", "though", "still", "yet"]],
  [/\btherefore\b/gi, ["so", "which means", "that's why"]],
  [/\bdemonstrate\b/gi, ["show", "prove", "make clear"]],
  [/\bsignificant\b/gi, ["big", "huge", "major", "serious"]],
  [/\bfacilitate\b/gi, ["help", "make easier", "speed up"]],
  [/\butilize\b/gi, ["use", "work with"]],
  [/\bimplement\b/gi, ["set up", "build", "put in place", "roll out"]],
  [/\bnumerous\b/gi, ["tons of", "a bunch of", "lots of", "plenty of"]],
  [/\bsubsequently\b/gi, ["after that", "then", "down the line"]],
  [/\bconsequently\b/gi, ["so", "because of that"]],
  [/\bprior to\b/gi, ["before", "ahead of"]],
  [/\bin order to\b/gi, ["to", "so we can"]],
  [/\bdue to the fact that\b/gi, ["because", "since", "seeing as"]],
  [/\bin spite of\b/gi, ["despite", "even with"]],
  [/\bat this point in time\b/gi, ["right now", "today"]],
  [/\bin the event that\b/gi, ["if", "when"]],
  [/\bfor the purpose of\b/gi, ["to"]],
  [/\ba large number of\b/gi, ["tons of", "a bunch of"]],
];

function disruptVocabulary(text: string): string {
  let result = text;
  for (const [pattern, replacements] of VOCABULARY_DISRUPTION) {
    result = result.replace(pattern, () => {
      return replacements[Math.floor(Math.random() * replacements.length)];
    });
  }
  return result;
}

// ============================================
// LAYER 3: Structural Randomization
// ============================================

function randomizeStructure(text: string): string {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  if (sentences.length < 3) return text;

  const result: string[] = [];

  for (let i = 0; i < sentences.length; i++) {
    let sent = sentences[i].trim();

    // Randomly merge short adjacent sentences (12% chance)
    if (sent.split(/\s+/).length < 8 && i < sentences.length - 1 && Math.random() < 0.12) {
      const next = sentences[i + 1]?.trim() || "";
      const connectors = [", and ", ", but ", " — ", ". Plus ", " — and "];
      const connector = connectors[Math.floor(Math.random() * connectors.length)];
      sent = sent.replace(/[.!?]$/, "") + connector + next.charAt(0).toLowerCase() + next.slice(1);
      i++;
    }

    // Randomly split long sentences (8% chance)
    if (sent.split(/\s+/).length > 22 && Math.random() < 0.08) {
      const words = sent.split(/\s+/);
      const midpoint = Math.floor(words.length * (0.4 + Math.random() * 0.2));
      const first = words.slice(0, midpoint).join(" ").replace(/[.!?]$/, "") + ".";
      const second = words.slice(midpoint).join(" ");
      result.push(first);
      result.push(second.charAt(0).toUpperCase() + second.slice(1));
      continue;
    }

    // Randomly make a sentence more fragment-like (5% chance)
    if (Math.random() < 0.05 && sent.split(/\s+/).length > 8) {
      sent = sent.replace(/[.!?]$/, "") + " — period.";
    }

    result.push(sent);
  }

  return result.join(" ");
}

// ============================================
// LAYER 4: Post-processing
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
    [/\bhe is\b/gi, "he's"],
    [/\bshe is\b/gi, "she's"],
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
  const killPhrases = [
    /\bin today's (?:rapidly evolving|fast-paced|ever-changing|modern|competitive) (?:digital |technological |business )?(?:world|landscape|era|environment)[,.]?\s*/gi,
    /\bit (?:is|was) (?:important|crucial|essential|worth noting|imperative) to (?:note|understand|remember|acknowledge|recognize)[,.]?\s*/gi,
    /\bplays? a (?:crucial|vital|key|pivotal|significant|central) role\b/gi,
    /\bin (?:conclusion|summary|essence)[,.]?\s/gi,
    /\bfurthermore[,.]?\s/gi,
    /\bmoreover[,.]?\s/gi,
    /\badditionally[,.]?\s/gi,
    /\bconsequently[,.]?\s/gi,
    /\bnevertheless[,.]?\s/gi,
    /\bnonetheless[,.]?\s/gi,
    /\bto summarize[,.]?\s/gi,
  ];

  for (const pattern of killPhrases) {
    result = result.replace(pattern, "");
  }

  // Clean up
  result = result.replace(/  +/g, " ");
  result = result.replace(/^[,.]\s*/, "");
  result = result.replace(/\s+([.!?])/g, "$1");

  return result.trim();
}

// ============================================
// MAIN EXPORTS
// ============================================

export async function rewriteText(options: RewriteOptions): Promise<RewriteResult> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY not configured");

  const layersApplied: string[] = [];

  // Layer 1: LLM rewrite
  let text = await llmRewrite(options.text, apiKey);
  layersApplied.push("llm-rewrite");

  // Layer 2: Vocabulary disruption
  if (options.intensity !== "light") {
    text = disruptVocabulary(text);
    layersApplied.push("vocabulary-disruption");
  }

  // Layer 3: Structural randomization
  if (options.intensity === "aggressive") {
    text = randomizeStructure(text);
    layersApplied.push("structural-randomization");
  }

  // Layer 4: Post-processing
  text = postProcess(text);
  layersApplied.push("post-processing");

  return {
    original: options.text,
    rewritten: text,
    passes: 1,
    model: "meta/llama-3.3-70b-instruct",
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

    // Check if AI phrases remain
    const dirty = /\b(furthermore|moreover|additionally|delve|tapestry|navigate|leverage|streamline|robust|comprehensive|seamless|pivotal|crucial|holistic|multifaceted|paradigm|foster|harness)\b/i.test(current);
    if (!dirty) break;
  }

  return {
    original: options.text,
    rewritten: current,
    passes,
    model: "meta/llama-3.3-70b-instruct",
    layersApplied: [...new Set(allLayers)],
  };
}
