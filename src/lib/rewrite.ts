// Humanization engine v3 — defeats statistical detection
// Core insight: increase perplexity (unpredictable word choices) 
// and burstiness (wild sentence variation) to match human fingerprints

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
// LAYER 1: LLM Rewrite — Perplexity + Burstiness Focus
// ============================================

const HUMANIZATION_SYSTEM = `You are a human writer. You rewrite text so it passes AI detectors.

The key to beating detectors is TWO things:
1. PERPLEXITY: Use UNPREDICTABLE word choices. Don't pick the obvious word. Pick surprising ones.
   Instead of "important" use "massive". Instead of "helps" use "gets you there". 
   Instead of "businesses need technology" write "every shop owner I know runs on spreadsheets and WhatsApp groups."
2. BURSTINESS: Vary sentence length WILDLY. Mix 3-word punches with 30-word ramblers.
   Some paragraphs: one sentence. Others: five sentences crammed together.

WRITING RULES:
- Write like a real person thinking out loud
- Use contractions: don't, can't, won't, it's, that's, I've, you're
- Add OPINIONS: "I think", "honestly", "in my experience", "the way I see it"
- Use SPECIFIC examples with numbers, names, details
- Go slightly off-topic sometimes (humans do this)
- Use "and" and "but" to start sentences
- Some sentences: fragments. Just a few words. For emphasis.
- Others: long, winding, with commas and parenthetical asides (like this one) that add texture
- End some sentences with questions? Or exclamations!
- Use "I mean", "you know", "look", "honestly" naturally
- Write SHORT paragraphs (1-3 sentences max)
- Vary paragraph openers — never repeat

THE TEXT MUST HAVE HIGH PERPLEXITY: use rare/unexpected word choices.
THE TEXT MUST HAVE HIGH BURSTINESS: wildly different sentence lengths.

NEVER USE: furthermore, moreover, additionally, delve, tapestry, landscape, navigate, 
leverage, streamline, empower, pivotal, crucial, vital, holistic, multifaceted, paradigm, 
foster, harness, comprehensive, robust, seamless, cutting-edge, state-of-the-art, 
in today's, it is important to, plays a role, game-changer, unlock, discover

Keep the same meaning. Keep roughly the same length. Make it undetectable.`;

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
          content: `Rewrite this (${charCount} chars). Keep similar length. Maximize perplexity and burstiness:\n\n${text}` 
        },
      ],
      temperature: 0.96,
      max_tokens: Math.min(4096, Math.ceil(charCount * 1.5)),
      top_p: 0.88,
      frequency_penalty: 0.85,
      presence_penalty: 0.65,
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
// LAYER 2: Perplexity Injection
// ============================================

// Replace predictable words with surprising alternatives
const PERPLEXITY_BOOST: [RegExp, string[]][] = [
  [/\bimportant\b/gi, ["massive", "huge", "a big deal", "noteworthy", "worth paying attention to"]],
  [/\bhelps?\b/gi, ["gets you there", "makes a difference", "does the trick", "moves the needle"]],
  [/\bsignificant\b/gi, ["enormous", "wildly different", "night and day", "not even close"]],
  [/\bdemonstrate\b/gi, ["show clearly", "prove beyond doubt", "lay bare", "put on display"]],
  [/\bimprove\b/gi, ["sharpen", "tighten", "level up", "give an edge"]],
  [/\bincrease\b/gi, ["pump up", "push higher", "grow", "ramp up"]],
  [/\bprovide\b/gi, ["hand over", "give", "set up with", "put in your hands"]],
  [/\brequire\b/gi, ["demand", "call for", "need badly"]],
  [/\bunderstand\b/gi, ["grasp", "wrap your head around", "get"]],
  [/\bconsider\b/gi, ["think about", "sit with", "mull over"]],
  [/\bdevelop\b/gi, ["build out", "grow", "put together", "craft"]],
  [/\bcreate\b/gi, ["whip up", "build", "put together", "make from scratch"]],
  [/\bachieve\b/gi, ["hit", "reach", "pull off", "get to"]],
  [/\bensure\b/gi, ["make sure", "guarantee", "lock in"]],
  [/\bfacilitate\b/gi, ["make easier", "smooth the way", "open doors for"]],
  [/\boptimize\b/gi, ["fine-tune", "dial in", "squeeze more out of"]],
  [/\bimplement\b/gi, ["roll out", "put in place", "get running", "set up"]],
];

function injectPerplexity(text: string): string {
  let result = text;
  for (const [pattern, replacements] of PERPLEXITY_BOOST) {
    result = result.replace(pattern, () => {
      return replacements[Math.floor(Math.random() * replacements.length)];
    });
  }
  return result;
}

// ============================================
// LAYER 3: Burstiness Injection
// ============================================

function injectBurstiness(text: string): string {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  if (sentences.length < 3) return text;

  const result: string[] = [];

  for (let i = 0; i < sentences.length; i++) {
    let sent = sentences[i].trim();
    const words = sent.split(/\s+/);

    // Randomly split long sentences into short punch + long follow (15%)
    if (words.length > 15 && Math.random() < 0.15) {
      const splitPoint = Math.floor(words.length * 0.35);
      const short = words.slice(0, splitPoint).join(" ").replace(/[.!?]$/, "") + ".";
      const rest = words.slice(splitPoint).join(" ");
      result.push(short);
      result.push(rest.charAt(0).toUpperCase() + rest.slice(1));
      continue;
    }

    // Randomly merge with next if both are short (10%)
    if (words.length < 8 && i < sentences.length - 1) {
      const nextWords = sentences[i + 1]?.trim().split(/\s+/) || [];
      if (nextWords.length < 8 && Math.random() < 0.1) {
        const connectors = [", and ", ", but ", ". ", " — "];
        const conn = connectors[Math.floor(Math.random() * connectors.length)];
        sent = sent.replace(/[.!?]$/, "") + conn + sentences[i + 1].trim().charAt(0).toLowerCase() + sentences[i + 1].trim().slice(1);
        i++;
      }
    }

    // Randomly add a fragment opener (8%)
    if (Math.random() < 0.08 && words.length > 8) {
      const openers = ["Look. ", "Honesty? ", "Here's the thing. ", "Real talk. ", "No joke. "];
      sent = openers[Math.floor(Math.random() * openers.length)] + sent;
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
    [/\bI have\b/gi, "I've"],
    [/\byou have\b/gi, "you've"],
    [/\bthey have\b/gi, "they've"],
    [/\bwe have\b/gi, "we've"],
    [/\blet us\b/gi, "let's"],
  ];

  for (const [pattern, replacement] of contractions) {
    result = result.replace(pattern, replacement);
  }

  // Remove remaining AI phrases
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

  let text = await llmRewrite(options.text, apiKey);
  layersApplied.push("llm-rewrite");

  if (options.intensity !== "light") {
    text = injectPerplexity(text);
    layersApplied.push("perplexity-injection");
  }

  if (options.intensity === "aggressive") {
    text = injectBurstiness(text);
    layersApplied.push("burstiness-injection");
  }

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

    const bannedWords = ["furthermore", "moreover", "additionally", "delve", "tapestry", "navigate", "leverage", "streamline", "robust", "comprehensive", "seamless", "pivotal", "crucial"];
    const hasBanned = bannedWords.some(w => new RegExp(`\\b${w}\\b`, "i").test(current));
    if (!hasBanned) break;
  }

  return {
    original: options.text,
    rewritten: current,
    passes,
    model: "meta/llama-3.3-70b-instruct",
    layersApplied: [...new Set(allLayers)],
  };
}
