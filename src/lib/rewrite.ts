// Humanization engine v7 — Targeted sentence-level rewrite
// Only rewrites sentences with AI patterns. Leaves clean sentences untouched.

const NVIDIA_API_BASE = "https://integrate.api.nvidia.com/v1";
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";

export interface RewriteOptions {
  text: string;
  domain: "academic";
  intensity: "aggressive";
}

export interface RewriteResult {
  original: string;
  rewritten: string;
  passes: number;
  model: string;
  layersApplied: string[];
}

// AI patterns that need rewriting
const AI_PATTERNS = [
  /\bfurthermore\b/i, /\bmoreover\b/i, /\badditionally\b/i,
  /\bdelve\b/i, /\btapestry\b/i, /\bnavigate\b.*\blandscape\b/i,
  /\bleverage\b/i, /\bstreamline\b/i, /\bempower\b/i,
  /\bpivotal\b/i, /\bcrucial\b.*\brole\b/i, /\bholistic\b/i,
  /\bmultifaceted\b/i, /\bparadigm\b/i, /\bfoster\b.*\bgrowth\b/i,
  /\bharness\b.*\bpotential\b/i, /\bcomprehensive\b.*\bsolution\b/i,
  /\brobust\b.*\bframework\b/i, /\bseamless\b/i,
  /\bcutting[- ]?edge\b/i, /\bstate[- ]?of[- ]?the[- ]?art\b/i,
  /\bin today's\b/i, /\bit is (important|crucial|essential) to\b/i,
  /\bplays? a (crucial|vital|pivotal|significant) role\b/i,
  /\bgame[- ]?changer\b/i, /\bhence\b/i, /\bthus\b/i, /\bconsequently\b/i,
  /\bin (conclusion|summary)\b/i,
];

function hasAIPattern(sentence: string): boolean {
  return AI_PATTERNS.some(p => p.test(sentence));
}

function splitIntoSentences(text: string): string[] {
  // Split on paragraph boundaries first, then sentences
  const paragraphs = text.split(/(\n\s*\n)/);
  const result: string[] = [];

  for (const para of paragraphs) {
    if (para.match(/^\n\s*\n$/)) {
      result.push(para); // keep paragraph break
      continue;
    }
    // Split into sentences, keeping punctuation
    const sentences = para.match(/[^.!?]*[.!?]+|[^.!?]+$/g) || [para];
    for (const sent of sentences) {
      result.push(sent);
    }
  }

  return result;
}

// Rewrite only sentences that have AI patterns
async function rewriteSentences(sentences: string[], apiKey: string): Promise<string[]> {
  // Find sentences that need rewriting
  const needsRewrite: { index: number; text: string }[] = [];
  for (let i = 0; i < sentences.length; i++) {
    if (hasAIPattern(sentences[i]) && sentences[i].trim().length > 20) {
      needsRewrite.push({ index: i, text: sentences[i] });
    }
  }

  if (needsRewrite.length === 0) return sentences; // nothing to rewrite

  // Batch rewrite (send all flagged sentences together for efficiency)
  const batchText = needsRewrite.map((s, i) => `[${i + 1}] ${s.text}`).join("\n");

  const prompt = `Rewrite these academic sentences to remove AI detection patterns. Keep the EXACT SAME meaning. Do NOT add new content. Do NOT add transitions. Output ONLY the rewritten sentences, numbered the same way.

${batchText}`;

  let rewritten = "";
  let usedModel = "gemini-2.5-flash";

  if (GEMINI_KEY) {
    try {
      rewritten = await callGemini(prompt);
    } catch {
      rewritten = await callNVIDIA(prompt, apiKey);
      usedModel = "meta/llama-3.3-70b-instruct";
    }
  } else {
    rewritten = await callNVIDIA(prompt, apiKey);
    usedModel = "meta/llama-3.3-70b-instruct";
  }

  // Parse rewritten sentences back
  const rewrittenLines = rewritten.split("\n").filter(l => l.trim());
  const result = [...sentences];

  for (let i = 0; i < needsRewrite.length && i < rewrittenLines.length; i++) {
    // Remove the [N] prefix if present
    let line = rewrittenLines[i].replace(/^\[\d+\]\s*/, "").trim();
    // Remove leading "Notably, " or "We found that " that the LLM might add
    line = line.replace(/^(Notably,|Interestingly,|We found that|This study finds that|This study shows that|We observe that|In this study, we)\s*/i, "");
    if (line.length > 10) {
      result[needsRewrite[i].index] = line;
    }
  }

  return result;
}

async function callNVIDIA(text: string, apiKey: string): Promise<string> {
  for (let attempt = 0; attempt <= 4; attempt++) {
    try {
      const response = await fetch(`${NVIDIA_API_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "meta/llama-3.3-70b-instruct",
          messages: [
            { role: "system", content: "You rewrite academic sentences to remove AI patterns. Keep meaning exactly. Never add content. Never add transitions. Output only rewritten sentences." },
            { role: "user", content: text },
          ],
          temperature: 0.7,
          max_tokens: 2048,
          top_p: 0.85,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.choices[0]?.message?.content?.trim() || text;
      }

      if (response.status === 429) {
        const waitMs = Math.min(5000 * Math.pow(2, attempt), 30000);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      throw new Error(`NVIDIA ${response.status}`);
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  throw new Error("NVIDIA failed");
}

async function callGemini(text: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `You rewrite academic sentences to remove AI patterns. Keep meaning exactly. Never add content. Output only rewritten sentences.\n\n${text}` }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
      }),
    }
  );

  if (!response.ok) throw new Error(`Gemini ${response.status}`);
  const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || text;
}

export async function rewriteText(options: RewriteOptions): Promise<RewriteResult> {
  const apiKey = process.env.NVIDIA_API_KEY || "";
  if (!apiKey && !GEMINI_KEY) throw new Error("No API key configured");

  const sentences = splitIntoSentences(options.text);
  const rewritten = await rewriteSentences(sentences, apiKey);

  return {
    original: options.text,
    rewritten: rewritten.join(""),
    passes: 1,
    model: "meta/llama-3.3-70b-instruct",
    layersApplied: ["sentence-scan", "targeted-rewrite"],
  };
}

export async function rewriteIterative(options: RewriteOptions, maxPasses: number = 2): Promise<RewriteResult> {
  let current = options.text;
  let passes = 0;

  for (let i = 0; i < maxPasses; i++) {
    passes++;
    const result = await rewriteText({ ...options, text: current });
    current = result.rewritten;

    // Check if any AI patterns remain
    const sentences = splitIntoSentences(current);
    const stillDirty = sentences.some(s => hasAIPattern(s) && s.trim().length > 20);
    if (!stillDirty) break;
  }

  return {
    original: options.text,
    rewritten: current,
    passes,
    model: "meta/llama-3.3-70b-instruct",
    layersApplied: ["sentence-scan", "targeted-rewrite"],
  };
}
