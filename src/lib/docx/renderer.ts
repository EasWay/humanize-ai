// Renderer — Rebuild .docx via direct XML text replacement (preserves EVERYTHING)
import JSZip from "jszip";
import type { DocxDocument } from "./types";

export async function renderDocx(doc: DocxDocument): Promise<Buffer> {
  // Get the original document.xml as raw string
  let documentXml = doc.documentXml;

  // Replace text in paragraphs — direct text replacement in XML
  for (const para of doc.paragraphs) {
    if (para.runs.length === 0) continue;
    
    // Build a map of original text → rewritten text for this paragraph
    const replacementMap = new Map<string, string>();
    for (const run of para.runs) {
      if (run.rewrittenText !== null && run.rewrittenText !== run.originalText) {
        replacementMap.set(run.originalText, run.rewrittenText);
      }
    }

    if (replacementMap.size === 0) continue;

    // Replace each text occurrence in the XML
    for (const [original, rewritten] of replacementMap) {
      if (!original) continue;
      // Replace all occurrences in the document
      documentXml = documentXml.split(original).join(rewritten);
    }
  }

  // Replace text in tables — they were added to doc.paragraphs during parsing
  // So the paragraph loop above already handled them!

  // Create new zip with modified document.xml
  const zip = new JSZip();
  for (const [path, content] of doc.files) {
    if (path === "word/document.xml") {
      zip.file(path, documentXml);
    } else if (typeof content === "string") {
      zip.file(path, content);
    } else {
      zip.file(path, content);
    }
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return buffer;
}