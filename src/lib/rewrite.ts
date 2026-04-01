// NVIDIA NIM client — free access to 150+ models
// Rewrite engine with aggressive humanization

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

// Example-driven system prompt — examples beat rules
const SYSTEM_PROMPT = `You are a human writer. Not an assistant. Not a helpful AI. You write like a real person — messy, opinionated, with personality.

CRITICAL: Output ONLY the rewritten text. Nothing else. No introduction, no explanation.

YOUR JOB: Take the given text and rewrite it so it sounds like an actual human typed it. Not "AI trying to sound human." Actually human.

HOW HUMANS ACTUALLY WRITE:

Humans start sentences with "And", "But", "So", "Because", "Look".
Humans use contractions: don't, can't, won't, it's, that's, I'm, you're, we're.
Humans write short sentences sometimes. Then follow with a longer one that goes on and has extra details.
Humans say "I think", "honestly", "actually", "basically", "pretty much", "kind of", "sort of".
Humans make typos occasionally and use informal grammar.
Humans use specific numbers and names instead of vague generalizations.
Humans go slightly off-topic sometimes.
Humans DON'T use: "delve", "tapestry", "landscape", "navigate", "furthermore", "moreover", "it's worth noting", "in conclusion", "plays a crucial role", "harness", "unlock potential", "cutting-edge", "robust", "seamless", "comprehensive", "paradigm", "foster", "leverage", "streamline", "empower", "multifaceted", "holistic", "nuanced", "myriad", "plethora".
Humans DON'T start with "In today's [adjective] [noun]".
Humans DON'T say "it is important/crucial/essential to note that".
Humans DON'T list exactly 3 things in a row (rule of three is an AI tell).
Humans DON'T write perfectly symmetrical paragraphs.
Humans DON'T end with "In conclusion" or "To summarize".

EXAMPLES:

AI: "In today's rapidly evolving digital landscape, it is crucial for businesses to leverage cutting-edge technology to foster growth and streamline operations."
HUMAN: "Every business needs tech now. That's just how it works. The ones that don't adapt get left behind — I've seen it happen to three companies in my area alone."

AI: "Furthermore, organizations must navigate the complex paradigm shift by implementing comprehensive solutions that empower their workforce."
HUMAN: "And it's not just about buying software. Your team actually needs to use it. I talked to a guy last week who bought Salesforce for his whole company and nobody touched it for six months."

AI: "Additionally, the integration of artificial intelligence plays a pivotal role in transforming business processes and enhancing productivity."
HUMAN: "AI changes things, no doubt. My friend's marketing team went from writing 2 blog posts a week to 10. Whether those 10 are any good... that's a different question."`;

function getDomainPrompt(domain: string): string {
  const prompts: Record<string, string> = {
    academic:
      "DOMAIN: Academic writing. You're a grad student writing a paper. You use some passive voice (especially in methods). You're precise but not robotic. You occasionally use 'we' when discussing findings. You don't use flowery academic jargon — you explain things plainly.",
    blog:
      "DOMAIN: Blog post. You're a blogger who's been doing this for years. Short paragraphs. Contractions everywhere. You talk directly to the reader. You're opinionated. You use 'I' and 'you'. You sometimes start paragraphs with 'Look,' or 'Here's the thing.'",
    technical:
      "DOMAIN: Technical writing. You're a developer writing docs. Active voice. Direct. Step-by-step where needed. You don't pad with filler. Code examples when relevant. You say 'run this' not 'one should execute the following command'.",
    creative:
      "DOMAIN: Creative writing. You're an author. Sensory details. Varied sentence rhythm. You show instead of tell. You use metaphors but not clichés. Your writing has texture and voice.",
  };
  return prompts[domain] || prompts.blog;
}

function getIntensityPrompt(intensity: string): string {
  const prompts: Record<string, string> = {
    light:
      "Keep most of the original meaning and structure. Just make it sound human — add contractions, break up long sentences, remove obvious AI phrases.",
    medium:
      "Restructure significantly. Change sentence order, add examples, inject personality. About half the words should be different from the original.",
    aggressive:
      "Completely rewrite. Same meaning, totally different delivery. Add anecdotes, opinions, specific details. Break every pattern. The original and rewritten should share maybe 20% of the same phrases.",
  };
  return prompts[intensity] || prompts.medium;
}

// Post-processing: inject human imperfections
function postProcess(text: string): string {
  let result = text;

  // Ensure contractions are present
  result = result.replace(/\bdo not\b/g, "don't");
  result = result.replace(/\bdoes not\b/g, "doesn't");
  result = result.replace(/\bcannot\b/g, "can't");
  result = result.replace(/\bwill not\b/g, "won't");
  result = result.replace(/\bwould not\b/g, "wouldn't");
  result = result.replace(/\bit is\b/g, "it's");
  result = result.replace(/\bthat is\b/g, "that's");
  result = result.replace(/\bthey are\b/g, "they're");
  result = result.replace(/\bwe are\b/g, "we're");
  result = result.replace(/\byou are\b/g, "you're");
  result = result.replace(/\bI am\b/g, "I'm");
  result = result.replace(/\bhe is\b/g, "he's");
  result = result.replace(/\bshe is\b/g, "she's");

  // Remove any remaining AI phrases that slipped through
  const aiPhrases = [
    /\bin today's (?:rapidly evolving|fast-paced|ever-changing|modern) (?:digital |technological |business )?(?:world|landscape|era)\b/gi,
    /\bit (?:is|was) (?:important|crucial|essential|worth noting) to (?:note|understand|remember|acknowledge)\b/gi,
    /\bplays? a (?:crucial|vital|key|pivotal|significant) role\b/gi,
    /\bin (?:conclusion|summary)\b/gi,
    /\bfurthermore\b/gi,
    /\bmoreover\b/gi,
    /\badditionally\b/gi,
  ];

  for (const pattern of aiPhrases) {
    result = result.replace(pattern, "");
  }

  // Clean up double spaces
  result = result.replace(/  +/g, " ");

  return result.trim();
}

export async function rewriteText(options: RewriteOptions): Promise<RewriteResult> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY not configured");

  const systemPrompt = [
    SYSTEM_PROMPT,
    getDomainPrompt(options.domain),
    getIntensityPrompt(options.intensity),
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
        { role: "user", content: `Rewrite this text to sound completely human:\n\n${options.text}` },
      ],
      temperature: 0.92,
      max_tokens: 4096,
      top_p: 0.9,
      frequency_penalty: 0.6,
      presence_penalty: 0.4,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`NVIDIA API error: ${response.status} — ${err}`);
  }

  const data = await response.json();
  let rewritten = data.choices[0]?.message?.content?.trim() || "";

  // Post-process to catch anything the model missed
  rewritten = postProcess(rewritten);

  return {
    original: options.text,
    rewritten,
    passes: 1,
    model: "meta/llama-3.3-70b-instruct",
  };
}

// Multi-pass rewrite: rewrite → check patterns → rewrite problem areas again
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

    // Check if any AI phrases remain
    const hasAIPhrases = /\b(furthermore|moreover|additionally|delve|tapestry|navigate|leverage|streamline|robust|comprehensive|seamless)\b/i.test(current);
    const hasAIStructure = /in today's/i.test(current) || /it is (important|crucial|essential)/i.test(current);

    if (!hasAIPhrases && !hasAIStructure) break; // Clean enough
  }

  return {
    original: options.text,
    rewritten: current,
    passes,
    model: "meta/llama-3.3-70b-instruct",
  };
}
