// Humanization engine v6 — Academic focus
// Strategy: split text into protected (citations/URLs) and prose segments.
// Only rewrite the prose. Reassemble with original protected content.

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

// ============================================
// SPLIT: Separate protected content from prose
// ============================================

// All patterns that should NOT be rewritten
const PROTECTED_REGEX = new RegExp([
  // URLs
  String.raw`https?:\/\/[^\s<>\])"']+`,
  // DOIs
  String.raw`doi:\s*10\.\d{4,}\/[^\s]+`,
  // Citations: (Author, Year), (Author et al., Year)
  String.raw`\([A-Z][a-z]+(?:\s+(?:et\s+al\.?|and|&)\s+[A-Z][a-z]+)*,?\s*\d{4}(?:,\s*(?:pp?\.\s*\d+(?:-\d+)?)?)?\)`,
  // Numbered refs: [1], [2-5]
  String.raw`\[\d+(?:\s*[-–,]\s*\d+)*\]`,
  // Figure/Table/Section references
  String.raw`(?:Figure|Fig\.|Table|Tab\.|Section|Sec\.)\s*\d+(?:\.\d+)?`,
  // Emails
  String.raw`[\w.-]+@[\w.-]+\.\w{2,}`,
  // ISBN/ISSN
  String.raw`(?:ISBN|ISSN)[:\s]*[\d-]+X?`,
  // In-text citations with semicolons
  String.raw`\([A-Z][a-z]+,?\s*\d{4}(?:;\s*[A-Z][a-z]+,?\s*\d{4})*\)`,
].join("|"), "g");

interface Segment {
  type: "prose" | "protected";
  text: string;
}

function splitText(text: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;

  // Reset regex
  PROTECTED_REGEX.lastIndex = 0;
  let match;

  while ((match = PROTECTED_REGEX.exec(text)) !== null) {
    // Add prose before this match
    if (match.index > lastIndex) {
      const prose = text.slice(lastIndex, match.index);
      if (prose.trim()) segments.push({ type: "prose", text: prose });
    }
    // Add protected segment
    segments.push({ type: "protected", text: match[0] });
    lastIndex = match.index + match[0].length;
  }

  // Add remaining prose
  if (lastIndex < text.length) {
    const prose = text.slice(lastIndex);
    if (prose.trim()) segments.push({ type: "prose", text: prose });
  }

  return segments.length > 0 ? segments : [{ type: "prose", text }];
}

// ============================================
// LLM REWRITE
// ============================================

const ACADEMIC_SYSTEM = `You are a simple academic English rewriter. You ONLY rewrite existing text.

ABSOLUTE RULES:
1. Output ONLY the rewritten text. Nothing else.
2. Keep the EXACT SAME MEANING. Do not add, remove, or change any facts, ideas, or information.
3. Keep the SAME NUMBER of sentences. If input has 5 sentences, output must have 5.
4. Keep the SAME LENGTH. Never expand. Prefer slightly shorter.
5. Use simple, clear English. Active voice. Contractions where natural.
6. Vary sentence lengths.
7. NEVER use: furthermore, moreover, additionally, delve, tapestry, landscape, navigate, leverage, streamline, empower, pivotal, crucial, vital, holistic, multifaceted, paradigm, foster, harness, comprehensive, robust, seamless, cutting-edge, state-of-the-art, in today's, it is important to, plays a role, game-changer, hence, thus, consequently, Notably, This study finds, We found that, This study shows, This study highlights, We observe that, We interpret
8. NEVER start sentences with: Although, While, Despite, Whereas, Notably, Interestingly
9. NEVER add transition phrases that weren't in the original.
10. NEVER add "Discussion:" or section labels.
11. NEVER add your own analysis, interpretation, or commentary.
12. Keep paragraph breaks.`;

async function callNVIDIA(text: string, apiKey: string): Promise<string> {
  const charCount = text.length;

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
            { role: "system", content: ACADEMIC_SYSTEM },
            { role: "user", content: `Rewrite this academic text. Keep same meaning. Keep same length. Do not add any new content.\n\n${text}` },
          ],
          temperature: 0.75,
          max_tokens: Math.min(2048, Math.ceil(charCount * 1.1)),
          top_p: 0.85,
          frequency_penalty: 0.5,
          presence_penalty: 0.3,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.choices[0]?.message?.content?.trim() || text;
      }

      if (response.status === 429) {
        const waitMs = Math.min(5000 * Math.pow(2, attempt), 30000);
        console.log(`[429] Waiting ${waitMs}ms`);
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
        contents: [{ role: "user", parts: [{ text: `${ACADEMIC_SYSTEM}\n\nRewrite this academic text. Keep same meaning. Keep same length. Do not add any new content.\n\n${text}` }] }],
        generationConfig: { temperature: 0.75, topP: 0.85, maxOutputTokens: 2048 },
      }),
    }
  );

  if (!response.ok) throw new Error(`Gemini ${response.status}`);
  const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || text;
}

async function rewriteProse(text: string, apiKey: string): Promise<string> {
  try {
    return await callNVIDIA(text, apiKey);
  } catch {
    if (GEMINI_KEY) {
      console.log("[Fallback] Using Gemini");
      return await callGemini(text);
    }
    throw new Error("All providers failed");
  }
}

// ============================================
// MAIN
// ============================================

export async function rewriteText(options: RewriteOptions): Promise<RewriteResult> {
  const apiKey = process.env.NVIDIA_API_KEY || "";
  if (!apiKey && !GEMINI_KEY) throw new Error("No API key configured");

  // Step 1: Split into prose and protected segments
  const segments = splitText(options.text);

  // Step 2: Rewrite only the prose segments
  const rewritten: string[] = [];
  for (const seg of segments) {
    if (seg.type === "prose" && seg.text.trim().length > 10) {
      const result = await rewriteProse(seg.text, apiKey);
      rewritten.push(result);
    } else {
      rewritten.push(seg.text);
    }
  }

  return {
    original: options.text,
    rewritten: rewritten.join(""),
    passes: 1,
    model: "meta/llama-3.3-70b-instruct",
    layersApplied: ["split-protect", "prose-rewrite", "reassemble"],
  };
}

export async function rewriteIterative(options: RewriteOptions, maxPasses: number = 2): Promise<RewriteResult> {
  let current = options.text;
  let passes = 0;
  const allLayers: string[] = [];

  for (let i = 0; i < maxPasses; i++) {
    passes++;
    const result = await rewriteText({ ...options, text: current });
    current = result.rewritten;
    allLayers.push(...result.layersApplied);

    const banned = ["furthermore", "moreover", "additionally", "delve", "leverage", "streamline", "robust", "comprehensive", "seamless", "pivotal", "crucial", "hence", "thus"];
    const hasBanned = banned.some(w => new RegExp(`\\b${w}\\b`, "i").test(current));
    if (!hasBanned) break;
  }

  return {
    original: options.text,
    rewritten: current,
    passes,
    model: "meta/llama-3.3-70b-instruct",
    layersApplied: Array.from(new Set(allLayers)),
  };
}
