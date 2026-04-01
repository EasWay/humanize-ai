// Multi-layer humanization engine
// Style: clear, sparse, direct — no fluff, no AI tells

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

const HUMANIZATION_SYSTEM = `You rewrite text so it passes AI detectors. Output ONLY the rewritten text.

WRITING STYLE RULES:
- Use clear, simple language
- Be spartan and informative
- Write short, punchy sentences
- Use active voice
- Focus on practical, actionable insights
- Use bullet points for clarity
- Add real data or examples
- Speak directly to the reader using "you" and "your"
- Use commas or periods instead of em dashes
- Keep output the same length or shorter than input

NEVER USE THESE:
- Em dashes (—)
- "Not just X, but also Y"
- Metaphors, clichés, generalizations
- "In conclusion", "to summarize"
- Unnecessary adjectives and adverbs
- Hashtags, semicolons, asterisks
- Setup phrases like "in conclusion"
- Vague filler words

BANNED WORDS (never use any of these):
can, may, just, that, very, really, literally, actually, certainly, probably, basically, 
could, maybe, delve, embark, shed light, imagine, realm, game-changer, unlock, discover, 
skyrocket, disruptive, utilize, groundbreaking, boost, ever-evolving, furthermore, moreover, 
additionally, comprehensive, robust, seamless, leverage, streamline, empower, pivotal, 
crucial, vital, holistic, multifaceted, paradigm, foster, harness, navigate, landscape, 
tapestry, cutting-edge, state-of-the-art, unlock potential, play a role, in today's,
it is important to, it is crucial to, it's worth noting, that being said

Write like a clear-thinking professional. Short sentences. Direct. No fluff.
The output must be undetectable by GPTZero, Originality.ai, and Turnitin.`;

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
          content: `Rewrite this text (${charCount} chars). Output must be same length or shorter. Style: clear, sparse, direct.\n\n${text}` 
        },
      ],
      temperature: 0.88,
      max_tokens: Math.min(4096, Math.ceil(charCount * 1.2)),
      top_p: 0.82,
      frequency_penalty: 0.9,
      presence_penalty: 0.7,
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
// LAYER 2: Banned Word Removal
// ============================================

const BANNED_WORDS = [
  "furthermore", "moreover", "additionally", "consequently", "nevertheless",
  "nonetheless", "comprehensive", "robust", "seamless", "leverage", "streamline",
  "empower", "pivotal", "crucial", "vital", "holistic", "multifaceted",
  "paradigm", "foster", "harness", "navigate", "landscape", "tapestry",
  "cutting-edge", "state-of-the-art", "groundbreaking", "game-changer",
  "delve", "embark", "realm", "skyrocket", "disruptive", "utilize",
  "boost", "ever-evolving", "unlock", "discover", "shed light",
  "literally", "actually", "certainly", "probably", "basically",
  "very", "really", "just", "maybe",
];

function removeBannedWords(text: string): string {
  let result = text;
  for (const word of BANNED_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    result = result.replace(regex, "");
  }
  // Clean up double spaces
  result = result.replace(/  +/g, " ").trim();
  return result;
}

// ============================================
// LAYER 3: Structural Cleanup
// ============================================

function cleanStructure(text: string): string {
  let result = text;

  // Replace em dashes with periods or commas
  result = result.replace(/\s*—\s*/g, ". ");
  
  // Remove "not just X, but also Y" patterns
  result = result.replace(/not just [^,]+, but (also )?/gi, "");
  
  // Remove "in conclusion" type phrases
  result = result.replace(/^(in conclusion|to summarize|in summary|to wrap up)[,.]?\s*/gmi, "");
  
  // Remove setup phrases
  result = result.replace(/^(it's worth noting|that being said|with that said|moving forward)[,.]?\s*/gmi, "");
  
  // Clean up leading/trailing punctuation
  result = result.replace(/^[,.]\s*/, "");
  result = result.replace(/\s+[,.]/g, ".");
  
  // Fix double spaces
  result = result.replace(/  +/g, " ");

  return result.trim();
}

// ============================================
// LAYER 4: Sentence-level Pass
// ============================================

function tightenSentences(text: string): string {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const result: string[] = [];

  for (let sent of sentences) {
    sent = sent.trim();
    
    // Remove unnecessary adjectives/adverbs
    sent = sent.replace(/\b(really|very|quite|rather|extremely|incredibly|remarkably|significantly|substantially)\s+/gi, "");
    
    // Shorten "in order to" → "to"
    sent = sent.replace(/\bin order to\b/gi, "to");
    
    // Shorten "due to the fact that" → "because"
    sent = sent.replace(/\bdue to the fact that\b/gi, "because");
    
    // Shorten "at this point in time" → "now"
    sent = sent.replace(/\bat this point in time\b/gi, "now");
    
    // Shorten "a large number of" → "many"
    sent = sent.replace(/\ba large number of\b/gi, "many");
    
    // Clean up
    sent = sent.replace(/  +/g, " ").trim();
    
    if (sent.length > 0) {
      result.push(sent);
    }
  }

  return result.join(" ");
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

  // Layer 2: Banned word removal
  text = removeBannedWords(text);
  layersApplied.push("banned-word-removal");

  // Layer 3: Structural cleanup
  text = cleanStructure(text);
  layersApplied.push("structural-cleanup");

  // Layer 4: Sentence tightening
  if (options.intensity !== "light") {
    text = tightenSentences(text);
    layersApplied.push("sentence-tightening");
  }

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

    // Check if banned words remain
    const hasBanned = BANNED_WORDS.some(w => 
      new RegExp(`\\b${w}\\b`, "i").test(current)
    );
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
