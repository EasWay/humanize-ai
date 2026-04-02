// Renderer — Rebuild .docx via XML-aware text replacement (preserves EVERYTHING)
import JSZip from "jszip";
import { XMLParser, XMLBuilder } from "fast-xml-parser";
import type { DocxDocument } from "./types";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  parseTagValue: false,
  trimValues: false,
});

export async function renderDocx(doc: DocxDocument): Promise<Buffer> {
  // Parse the document XML
  const parsed = xmlParser.parse(doc.documentXml);
  const body = parsed?.["w:document"]?.["w:body"];
  if (!body) throw new Error("Invalid document XML — no body found");

  // Build replacement map: originalText -> rewrittenText for ALL runs
  const replacementMap = new Map<string, string>();
  for (const para of doc.paragraphs) {
    for (const run of para.runs) {
      if (run.rewrittenText !== null && run.rewrittenText !== run.originalText && run.originalText) {
        replacementMap.set(run.originalText, run.rewrittenText);
      }
    }
  }

  // Only proceed if there are changes
  if (replacementMap.size === 0) {
    // No changes — just repackage original
    return repackageZip(doc.files);
  }

  // Replace text in all <w:t> elements
  replaceTextInXml(body, replacementMap);

  // Convert back to XML string
  const xmlBuilder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    format: false,
    suppressBooleanAttributes: false,
    suppressEmptyNode: false,
  });
  const newDocumentXml = xmlBuilder.build(parsed);

  // Create new zip with modified document.xml
  const zip = new JSZip();
  for (const [path, content] of doc.files) {
    if (path === "word/document.xml") {
      zip.file(path, newDocumentXml);
    } else if (typeof content === "string") {
      zip.file(path, content);
    } else {
      zip.file(path, content);
    }
  }

  return await zip.generateAsync({ type: "nodebuffer" });
}

function replaceTextInXml(obj: unknown, replacements: Map<string, string>): void {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      replaceTextInXml(item, replacements);
    }
    return;
  }

  const record = obj as Record<string, unknown>;

  // If this is a text node (w:t), do replacement
  if (record["#text"] !== undefined) {
    const text = record["#text"] as string;
    for (const [original, rewritten] of replacements) {
      if (text.includes(original)) {
        record["#text"] = text.split(original).join(rewritten);
        break; // Only one replacement per text node
      }
    }
    return;
  }

  // Recurse into children
  for (const value of Object.values(record)) {
    replaceTextInXml(value, replacements);
  }
}

async function repackageZip(files: Map<string, string | Uint8Array>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [path, content] of files) {
    if (typeof content === "string") {
      zip.file(path, content);
    } else {
      zip.file(path, content);
    }
  }
  return await zip.generateAsync({ type: "nodebuffer" });
}