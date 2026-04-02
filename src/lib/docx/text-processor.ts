// Text processor — rewrite text blocks while preserving document structure
import type { DocxDocument, TextBlock, RewriteResult } from "./types";
import { extractTextBlocks } from "./parser";
import { protectTokens, restoreTokens } from "./protected-tokens";

// Import the existing rewrite function
import { rewriteText } from "@/lib/rewrite";

const MAX_CHUNK = 2000;

export async function processDocument(doc: DocxDocument): Promise<DocxDocument> {
  // 1. Extract text blocks from the document
  const blocks = extractTextBlocks(doc);

  // 2. Protect tokens in each block
  for (const block of blocks) {
    const { text, tokens } = protectTokens(block.text);
    block.text = text;
    block.protectedTokens = tokens;
  }

  // 3. Rewrite each block
  const rewriteResults: RewriteResult[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!block.text.trim()) {
      rewriteResults.push({ original: block.text, rewritten: block.text, blockIdx: i });
      continue;
    }

    try {
      const safeText = block.text.slice(0, MAX_CHUNK);
      const result = await rewriteText({
        text: safeText,
        domain: "academic",
        intensity: "aggressive",
      });

      // Restore protected tokens
      const rewritten = restoreTokens(result.rewritten, block.protectedTokens);
      rewriteResults.push({ original: block.text, rewritten, blockIdx: i });
    } catch (e) {
      console.error(`Rewrite failed for block ${i}:`, e);
      rewriteResults.push({ original: block.text, rewritten: block.text, blockIdx: i });
    }
  }

  // 4. Map rewritten text back to runs
  applyRewrites(doc, blocks, rewriteResults);

  return doc;
}

function applyRewrites(doc: DocxDocument, blocks: TextBlock[], results: RewriteResult[]): void {
  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi];
    const result = results[bi];
    if (!result || result.original === result.rewritten) continue;

    const para = doc.paragraphs[block.paragraphIdx];
    if (!para || para.runs.length === 0) continue;

    // Split the rewritten text back across the original runs
    // Strategy: proportional distribution
    const originalTotal = para.runs.reduce((sum, r) => sum + r.originalText.length, 0);
    if (originalTotal === 0) continue;

    const rewrittenText = result.rewritten;
    let charIdx = 0;

    for (let ri = 0; ri < para.runs.length; ri++) {
      const run = para.runs[ri];
      const proportion = run.originalText.length / originalTotal;
      let charsToTake = Math.round(rewrittenText.length * proportion);

      // Last run gets the remainder
      if (ri === para.runs.length - 1) {
        charsToTake = rewrittenText.length - charIdx;
      }

      run.rewrittenText = rewrittenText.slice(charIdx, charIdx + charsToTake);
      run.text = run.rewrittenText;
      charIdx += charsToTake;
    }

    // Handle rounding errors — pad or trim last run
    if (charIdx < rewrittenText.length) {
      const lastRun = para.runs[para.runs.length - 1];
      lastRun.rewrittenText = (lastRun.rewrittenText || "") + rewrittenText.slice(charIdx);
      lastRun.text = lastRun.rewrittenText;
    }
  }
}
