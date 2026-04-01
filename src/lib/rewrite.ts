// Humanization engine v5 — Academic focus
// Preserves citations, URLs, references, facts exactly
// Only rewrites prose in simple academic English

const NVIDIA_API_BASE = "https://integrate.api.nvidia.com/v1";

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
// CITATION & REFERENCE PROTECTION
// ============================================

// Patterns to protect (never rewrite these)
const PROTECTED_PATTERNS = [
  // URLs
  /https?:\/\/[^\s<>\])"']+/g,
  // DOIs
  /doi:\s*10\.\d{4,}\/[^\s]+/gi,
  // Academic citations: (Author, Year), (Author et al., Year)
  /\([A-Z][a-z]+(?:\s+(?:et\s+al\.?|and|&)\s+[A-Z][a-z]+)*,?\s*\d{4}(?:,\s*(?:pp?\.\s*\d+(?:-\d+)?)?)?\)/g,
  // Numbered references: [1], [2-5], [1,2,3]
  /\[\d+(?:\s*[-–,]\s*\d+)*\]/g,
  // Page references
  /(?:pp?\.\s*\d+(?:-\d+)?)/g,
  // Figure/Table references
  /(?:Figure|Fig\.|Table|Tab\.)\s*\d+(?:\.\d+)?/g,
  // Section references
  /(?:Section|Sec\.)\s*\d+(?:\.\d+)?/g,
  // Equation references
  /(?:Equation|Eq\.)\s*\d+/g,
  // ISBN/ISSN
  /(?:ISBN|ISSN)[:\s]*[\d-]+X?/g,
  // Email addresses
  /[\w.-]+@[\w.-]+\.\w{2,}/g,
  // In-text citations with semicolons: (Smith, 2020; Jones, 2021)
  /\([A-Z][a-z]+,?\s*\d{4}(?:;\s*[A-Z][a-z]+,?\s*\d{4})*\)/g,
];

interface ProtectedSegment {
  placeholder: string;
  original: string;
}

function protectContent(text: string): { text: string; segments: ProtectedSegment[] } {
  const segments: ProtectedSegment[] = [];
  let result = text;
  let counter = 0;

  for (const pattern of PROTECTED_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      const placeholder = `__PROTECTED_${counter}__`;
      segments.push({ placeholder, original: match[0] });
      result = result.replace(match[0], placeholder);
      counter++;
    }
  }

  return { text: result, segments };
}

function restoreContent(text: string, segments: ProtectedSegment[]): string {
  let result = text;
  for (const seg of segments) {
    result = result.replace(seg.placeholder, seg.original);
  }
  return result;
}

// ============================================
// LLM REWRITE — Academic Simple English
// ============================================

const ACADEMIC_SYSTEM = `You rewrite academic text so it passes AI detectors while keeping it scholarly.

Output ONLY the rewritten text. Nothing else.

YOUR WRITING STYLE:
- Simple academic English. Clear. Direct. Not flowery.
- Use active voice where possible ("We found that..." not "It was found that...")
- Keep technical terms exact — don't simplify jargon the audience expects
- Short sentences mixed with medium ones. No 50-word monsters.
- Use "we" for research findings, "this study" for self-reference
- Contractions are okay in Discussion sections, not Methods
- Use transitions naturally: "However," "In contrast," "Notably,"
- Vary paragraph lengths (some 2 sentences, some 5)
- Include one analytical comment per paragraph (your own interpretation)
- Use passive voice in Methods sections only
- Be specific: use numbers, percentages, exact findings
- CRITICAL: Keep ALL placeholder tags (__PROTECTED_0__, etc.) EXACTLY as they appear — do not modify, move, or remove them
- CRITICAL: Do not create NEW placeholder tags. Only use the ones already in the input text.
- CRITICAL: Do not modify any citation placeholders, URLs, or reference markers
- CRITICAL: Keep the same paragraph breaks as the input

NEVER USE: furthermore, moreover, additionally, delve, tapestry, landscape, navigate, 
leverage, streamline, empower, pivotal, crucial, vital, holistic, multifaceted, paradigm, 
foster, harness, comprehensive, robust, seamless, cutting-edge, state-of-the-art, 
in today's, it is important to, plays a role, game-changer, meticulous, intricacies,
hence, thus, consequently, it is worth noting, the fact of the matter is

NEVER start sentences with: Although, While, Despite, Whereas, Moreover, Furthermore

Keep the meaning EXACTLY the same. Keep the same length or slightly shorter.`;

async function llmRewrite(text: string, apiKey: string): Promise<string> {
  const charCount = text.length;

  // Retry with exponential backoff
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
            {
              role: "user",
              content: `Rewrite this academic text (${charCount} chars). Keep placeholder tags intact. Keep same length.\n\n${text}`,
            },
          ],
          temperature: 0.88,
          max_tokens: Math.min(2048, Math.ceil(charCount * 1.2)),
          top_p: 0.85,
          frequency_penalty: 0.7,
          presence_penalty: 0.5,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.choices[0]?.message?.content?.trim() || text;
      }

      // Rate limited — wait and retry
      if (response.status === 429) {
        const waitMs = Math.min(5000 * Math.pow(2, attempt), 30000);
        console.log(`[429] Rate limited, waiting ${waitMs}ms (attempt ${attempt + 1}/5)`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      // Other error — throw immediately
      const err = await response.text();
      throw new Error(`NVIDIA API error: ${response.status} — ${err}`);
    } catch (e) {
      if (attempt >= 4) throw e;
      // Network error — retry
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  throw new Error("Max retries exceeded");
}

// ============================================
// POST-PROCESSING — Clean up only
// ============================================

function postProcess(text: string): string {
  let result = text;

  // Remove any remaining AI phrases that slipped through
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

  // Step 1: Protect citations, URLs, references
  const { text: protectedText, segments } = protectContent(options.text);

  // Step 2: LLM rewrite (preserves placeholders)
  let text = await llmRewrite(protectedText, apiKey);
  layersApplied.push("academic-rewrite");

  // Step 3: Restore protected content
  text = restoreContent(text, segments);
  layersApplied.push("citation-restore");

  // Step 4: Clean up
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

    const banned = ["furthermore", "moreover", "additionally", "delve", "tapestry", "navigate", "leverage", "streamline", "robust", "comprehensive", "seamless", "pivotal", "crucial", "hence", "thus"];
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
