// NVIDIA NIM client — free access to 150+ models
// Uses OpenAI-compatible API format

const NVIDIA_API_BASE = "https://integrate.api.nvidia.com/v1";

export interface RewriteOptions {
  text: string;
  domain: "academic" | "blog" | "technical" | "creative";
  intensity: "light" | "medium" | "aggressive";
  targetDetector?: "gptzero" | "originality" | "turnitin" | "general";
}

export interface RewriteResult {
  original: string;
  rewritten: string;
  passes: number;
  model: string;
}

const SYSTEM_PROMPT = `You are a text humanization engine. Your ONLY job is to rewrite AI-generated text so it reads as naturally human-written.

RULES:
- Output ONLY the rewritten text. No explanations, no labels, no quotes, no preamble.
- Preserve the original meaning and factual content exactly.
- Change sentence structure, vocabulary, and rhythm.
- Add natural imperfections humans make: occasional fragments, contractions, informal connectors.
- Vary sentence length dramatically (some 5 words, some 30+).
- Avoid AI tells: "delve", "tapestry", "landscape", "navigate", "furthermore", "moreover", "it's worth noting", "in conclusion", "plays a crucial role", "harness the power", "in today's [X] world".
- Break the rule-of-three pattern (AI loves listing 3 things).
- Use specific examples instead of vague generalizations.
- Add mild tangential thoughts where natural.
- Keep paragraphs varied in length.
- Never use "Additionally" or "Furthermore" as paragraph openers.`;

function getDomainPrompt(domain: string): string {
  const prompts: Record<string, string> = {
    academic:
      "STYLE: Academic but natural. Keep passive voice where it belongs (Methods sections). Use precise vocabulary but avoid jargon stacking. Contractions are okay in Discussion sections. Abstracts should be tight — no filler words.",
    blog:
      "STYLE: Conversational blog writing. Contractions everywhere. Short paragraphs (1-3 sentences). Occasional fragments for emphasis. Direct address ('you'). Informal but not sloppy.",
    technical:
      "STYLE: Technical documentation. Precise, clear, no fluff. Active voice preferred. Step-by-step where applicable. Keep technical terms exact — don't simplify jargon the audience expects.",
    creative:
      "STYLE: Creative and expressive. Sensory details. Varied rhythm. Metaphors welcome but not clichéd. Show don't tell. Emotional resonance over efficiency.",
  };
  return prompts[domain] || prompts.blog;
}

function getIntensityPrompt(intensity: string): string {
  const prompts: Record<string, string> = {
    light:
      "INTENSITY: Light rewrite. Keep 70% of original structure. Focus on removing obvious AI patterns and adding minor natural touches.",
    medium:
      "INTENSITY: Medium rewrite. Restructure sentences significantly. Replace generic phrases with specific ones. Add contractions and natural rhythm. Target 50% structural change.",
    aggressive:
      "INTENSITY: Aggressive rewrite. Completely restructure paragraphs. Add voice, personality, imperfections. Break symmetry hard. Target 80% structural change while keeping meaning intact.",
  };
  return prompts[intensity] || prompts.medium;
}

function getDetectorPrompt(detector?: string): string {
  if (!detector || detector === "general") return "";
  const prompts: Record<string, string> = {
    gptzero:
      "DETECTOR TARGET: GPTZero — focus on increasing perplexity (use less predictable word choices) and burstiness (wildly vary sentence length). This detector scores on token probability, so occasionally pick uncommon synonyms.",
    originality:
      "DETECTOR TARGET: Originality.ai — focus on removing stylometric fingerprints. Break paragraph symmetry, vary vocabulary richness, add colloquialisms. This detector is aggressive on structure.",
    turnitin:
      "DETECTOR TARGET: Turnitin — focus on removing patterns that match training data. Rephrase common collocations, avoid textbook phrasing, use less common sentence openings.",
  };
  return prompts[detector] || "";
}

export async function rewriteText(options: RewriteOptions): Promise<RewriteResult> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY not configured");

  const systemPrompt = [
    SYSTEM_PROMPT,
    getDomainPrompt(options.domain),
    getIntensityPrompt(options.intensity),
    getDetectorPrompt(options.targetDetector),
  ]
    .filter(Boolean)
    .join("\n\n");

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
        { role: "user", content: options.text },
      ],
      temperature: 0.85,
      max_tokens: 4096,
      top_p: 0.95,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`NVIDIA API error: ${response.status} — ${err}`);
  }

  const data = await response.json();
  const rewritten = data.choices[0]?.message?.content?.trim() || "";

  return {
    original: options.text,
    rewritten,
    passes: 1,
    model: "meta/llama-3.3-70b-instruct",
  };
}

// Multi-pass rewrite: rewrite → detect → rewrite again
export async function rewriteIterative(
  options: RewriteOptions,
  maxPasses: number = 3
): Promise<RewriteResult> {
  let current = options.text;
  let passes = 0;

  for (let i = 0; i < maxPasses; i++) {
    passes++;
    const result = await rewriteText({ ...options, text: current });
    current = result.rewritten;

    // Quick inline detection check
    const score = scoreText(current);
    if (score.humanScore >= 8) break; // Good enough
  }

  return {
    original: options.text,
    rewritten: current,
    passes,
    model: "meta/llama-3.3-70b-instruct",
  };
}

// Inline pattern scoring (imported from patterns.ts)
function scoreText(text: string): { humanScore: number } {
  // Simplified — full version in patterns.ts
  let score = 10;
  const lowerText = text.toLowerCase();

  const deadGiveaways = ["delve", "tapestry", "navigate", "harness", "landscape", "realm"];
  for (const word of deadGiveaways) {
    if (lowerText.includes(word)) score -= 2;
  }

  return { humanScore: Math.max(0, Math.min(10, score)) };
}
