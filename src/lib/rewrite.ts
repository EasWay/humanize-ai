// Layered humanization engine — defeats statistical detection
// Layer 1: LLM rewrite with anti-detection prompts
// Layer 2: Statistical fingerprint disruption (perplexity injection)
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

const HUMANIZATION_SYSTEM = `You write like a real person writing casually. Not like an AI assistant.

RULES:
- Output ONLY the rewritten text. Nothing else.
- Write like you're texting a smart friend about the topic.
- Start sentences with: And, But, So, Look, Here's the thing, Honestly, Basically, The thing is.
- Use contractions: don't, can't, won't, it's, that's, I've, you're.
- Use informal language: kind of, sort of, pretty much, a lot, stuff, thing.
- Add personal touches: "I've noticed", "honestly", "from what I've seen", "in my experience".
- Some sentences should be really short. Like this.
- Others should be long and rambling, going off on slight tangents before circling back.
- Use specific examples, numbers, names instead of vague claims.
- End some sentences with "right?" or "you know?" or "honestly."
- Use em dashes — like this — for asides.
- Start paragraphs with different words (never repeat paragraph openers).
- DON'T use: delve, tapestry, landscape, navigate, furthermore, moreover, additionally, comprehensive, robust, seamless, leverage, streamline, empower, pivotal, crucial, vital, holistic, multifaceted, paradigm, foster, harness.
- DON'T use "In today's [adjective] [noun]".
- DON'T use "it is important/crucial/essential to".
- DON'T list exactly 3 things.
- DON'T write perfectly.
- The output should feel like someone actually typed it, not like it was generated.`;

async function llmRewrite(text: string, apiKey: string): Promise<string> {
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
        { role: "user", content: `Rewrite this to sound like a real person wrote it casually:\n\n${text}` },
      ],
      temperature: 0.95,
      max_tokens: 4096,
      top_p: 0.88,
      frequency_penalty: 0.7,
      presence_penalty: 0.5,
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

// Replace common words with less predictable alternatives
// This increases perplexity (detectors flag low-perplexity text)
const VOCABULARY_DISRUPTION: [RegExp, string[]][] = [
  [/\bvery\b/gi, ["really", "super", "incredibly", "remarkably", "genuinely", ""]],
  [/\bimportant\b/gi, ["key", "huge", "massive", "essential", "critical", "big"]],
  [/\bhowever\b/gi, ["but", "though", "still", "yet", "that said"]],
  [/\btherefore\b/gi, ["so", "which means", "so basically", "that's why"]],
  [/\bdemonstrate\b/gi, ["show", "prove", "make clear", "lay out"]],
  [/\bsignificant\b/gi, ["big", "huge", "major", "serious", "real"]],
  [/\bfacilitate\b/gi, ["help", "make easier", "speed up", "push forward"]],
  [/\butilize\b/gi, ["use", "work with", "put to work"]],
  [/\bimplement\b/gi, ["set up", "build", "put in place", "roll out", "get going"]],
  [/\bnumerous\b/gi, ["tons of", "a bunch of", "lots of", "plenty of", "so many"]],
  [/\bsubsequently\b/gi, ["after that", "then", "next", "down the line"]],
  [/\bconsequently\b/gi, ["so", "because of that", "which means"]],
  [/\bprior to\b/gi, ["before", "ahead of"]],
  [/\bin order to\b/gi, ["to", "so we can", "to be able to"]],
  [/\bdue to the fact that\b/gi, ["because", "since", "seeing as"]],
  [/\ba large number of\b/gi, ["tons of", "a bunch of", "lots of"]],
  [/\bin spite of\b/gi, ["despite", "even with"]],
  [/\bat this point in time\b/gi, ["right now", "at this point", "today"]],
  [/\bin the event that\b/gi, ["if", "when"]],
  [/\bfor the purpose of\b/gi, ["to", "so we can"]],
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

    // Randomly merge adjacent short sentences (15% chance)
    if (sent.split(/\s+/).length < 8 && i < sentences.length - 1 && Math.random() < 0.15) {
      const next = sentences[i + 1]?.trim() || "";
      // Use varied connectors
      const connectors = [", and ", ", but ", " — ", ". Plus ", ". Also, "];
      const connector = connectors[Math.floor(Math.random() * connectors.length)];
      sent = sent.replace(/[.!?]$/, "") + connector + next.charAt(0).toLowerCase() + next.slice(1);
      i++; // skip next
    }

    // Randomly split long sentences (10% chance)
    if (sent.split(/\s+/).length > 20 && Math.random() < 0.1) {
      const words = sent.split(/\s+/);
      const midpoint = Math.floor(words.length * (0.4 + Math.random() * 0.2));
      const first = words.slice(0, midpoint).join(" ");
      const second = words.slice(midpoint).join(" ");
      // Make second part a fragment sometimes
      if (Math.random() < 0.3) {
        result.push(first.replace(/[.!?]$/, "") + ".");
        result.push(second.charAt(0).toUpperCase() + second.slice(1));
      } else {
        result.push(first.replace(/[.!?]$/, "") + ".");
        result.push(second.charAt(0).toUpperCase() + second.slice(1));
      }
      continue;
    }

    // Randomly convert to fragment (5% chance)
    if (Math.random() < 0.05 && sent.split(/\s+/).length > 6) {
      sent = sent.replace(/^(And |But |So |Yet |Still )?/, "").replace(/[.!?]$/, "");
      // Make it punchy
      const fragments = [
        sent.charAt(0).toUpperCase() + sent.slice(1) + ".",
        sent.charAt(0).toUpperCase() + sent.slice(1) + " — period.",
      ];
      sent = fragments[Math.floor(Math.random() * fragments.length)];
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

  // Inject contractions aggressively
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
    [/\bwhat is\b/gi, "what's"],
    [/\bwho is\b/gi, "who's"],
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
    [/\bI would\b/gi, "I'd"],
    [/\byou would\b/gi, "you'd"],
    [/\bI will\b/gi, "I'll"],
    [/\byou will\b/gi, "you'll"],
    [/\blet us\b/gi, "let's"],
  ];

  for (const [pattern, replacement] of contractions) {
    result = result.replace(pattern, replacement);
  }

  // Remove any remaining AI phrases
  const killPhrases = [
    /\bin today's (?:rapidly evolving|fast-paced|ever-changing|modern|competitive) (?:digital |technological |business )?(?:world|landscape|era|environment)\b/gi,
    /\bit (?:is|was) (?:important|crucial|essential|worth noting|imperative) to (?:note|understand|remember|acknowledge|recognize)\b/gi,
    /\bplays? a (?:crucial|vital|key|pivotal|significant|central) role\b/gi,
    /\bin (?:conclusion|summary|essence)\b/gi,
    /\bfurthermore[,.]?\s/gi,
    /\bmoreover[,.]?\s/gi,
    /\badditionally[,.]?\s/gi,
    /\bconsequently[,.]?\s/gi,
    /\bnevertheless[,.]?\s/gi,
    /\bnonetheless[,.]?\s/gi,
    /\bto summarize[,.]?\s/gi,
    /\bthat being said[,.]?\s/gi,
  ];

  for (const pattern of killPhrases) {
    result = result.replace(pattern, "");
  }

  // Clean up artifacts
  result = result.replace(/  +/g, " ");
  result = result.replace(/^[,.]\s*/, ""); // Remove leading punctuation
  result = result.replace(/\s+([.!?])/g, "$1"); // Fix spacing before punctuation

  return result.trim();
}

// ============================================
// MAIN EXPORT
// ============================================

export async function rewriteText(options: RewriteOptions): Promise<RewriteResult> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY not configured");

  const layersApplied: string[] = [];

  // Layer 1: LLM rewrite
  let text = await llmRewrite(options.text, apiKey);
  layersApplied.push("llm-rewrite");

  // Layer 2: Vocabulary disruption (increases perplexity)
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
    const dirty = /\b(furthermore|moreover|additionally|delve|tapestry|navigate|leverage|streamline|robust|comprehensive|seamless|pivotal|crucial)\b/i.test(current);
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
