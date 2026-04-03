// Renderer — Rebuild .docx via surgical DOM patching (100% Lossless)
import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import type { DocxDocument } from "./types";

export async function renderDocx(doc: DocxDocument): Promise<Buffer> {
  // 1. Use standard DOM to avoid JSON tag-reordering corruption
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(doc.documentXml, "text/xml");

  // 2. Build a strict replacement queue based on the parser's output
  // We use a queue to handle multiple identical strings appearing sequentially
  const replacementQueue = new Map<string, string[]>();
  for (const para of doc.paragraphs) {
    for (const run of para.runs) {
      if (run.rewrittenText !== null && run.rewrittenText !== run.originalText && run.originalText) {
        if (!replacementQueue.has(run.originalText)) {
          replacementQueue.set(run.originalText, []);
        }
        replacementQueue.get(run.originalText)!.push(run.rewrittenText);
      }
    }
  }

  if (replacementQueue.size === 0) return repackageZip(doc.files);

  // 3. Traverse <w:r> (Run) elements to perfectly match parser logic
  const runNodes = xmlDoc.getElementsByTagName("w:r");
  for (let i = 0; i < runNodes.length; i++) {
    const rNode = runNodes[i];
    
    // Find all <w:t> (Text) children of this specific run
    const tNodes: Element[] = [];
    for (let j = 0; j < rNode.childNodes.length; j++) {
      const child = rNode.childNodes[j] as unknown as Element;
      if (child && child.tagName === "w:t") {
        tNodes.push(child);
      }
    }

    if (tNodes.length === 0) continue;

    // Reconstruct the fragmented text exactly as parser.ts did
    let combinedText = "";
    for (const tNode of tNodes) {
      combinedText += tNode.textContent || "";
    }

    // Check if we have an AI rewrite for this exact combined fragment
    if (combinedText && replacementQueue.has(combinedText)) {
      const queue = replacementQueue.get(combinedText)!;
      if (queue.length > 0) {
        const rewrittenText = queue.shift()!;
        
        // RUN CONSOLIDATION: Put all rewritten text into the first <w:t> node.
        // xmldom automatically escapes &, <, > to prevent XML corruption.
        tNodes[0].textContent = rewrittenText;
        
        // Clear subsequent fragments to un-fragment the word safely
        for (let k = 1; k < tNodes.length; k++) {
          tNodes[k].textContent = ""; 
        }
      }
    }
  }

  // 4. Serialize back to XML (preserves all namespaces, order, and self-closing tags)
  const serializer = new XMLSerializer();
  const newDocumentXml = serializer.serializeToString(xmlDoc);

  // 5. Repackage into a new buffer
  doc.files.set("word/document.xml", newDocumentXml);
  return repackageZip(doc.files);
}

async function repackageZip(files: Map<string, string | Uint8Array>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [path, content] of files) {
    zip.file(path, content); // Automatically handles both String and Uint8Array perfectly
  }
  return await zip.generateAsync({ type: "nodebuffer" });
}