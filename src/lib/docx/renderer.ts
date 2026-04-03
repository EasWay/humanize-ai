// Renderer — Surgical DOM-Patching approach for perfect DOCX preservation
import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";
import type { DocxDocument } from "./types";

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export async function renderDocx(doc: DocxDocument): Promise<Buffer> {
  // Parse the document XML as a standard DOM
  const parser = new DOMParser();
  const docXml = parser.parseFromString(doc.documentXml, "application/xml");
  
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

  // Find all <w:r> (run) elements and process them
  const runs = docXml.getElementsByTagNameNS(W_NS, "r");
  
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    
    // Get all text nodes (w:t) in this run
    const textNodes = run.getElementsByTagNameNS(W_NS, "t");
    
    // Consolidate fragmented text: "Hel" + "lo" -> "Hello"
    let consolidatedText = "";
    for (let j = 0; j < textNodes.length; j++) {
      consolidatedText += textNodes[j].textContent || "";
    }
    
    // Check if this consolidated text has a replacement
    if (replacementMap.has(consolidatedText)) {
      const newText = replacementMap.get(consolidatedText)!;
      
      // Replace all text nodes in this run with the new text
      // This preserves formatting (bold, italic, etc.) from the run properties
      for (let j = 0; j < textNodes.length; j++) {
        textNodes[j].textContent = newText;
      }
    }
  }

  // Serialize back to XML
  const serializer = new XMLSerializer();
  const docElement = docXml.documentElement;
  if (!docElement) throw new Error("Failed to serialize document");
  // Use type assertion for xmldom compatibility
  const newDocumentXml = serializer.serializeToString(docElement as unknown as Document | Element);

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

// Simple serializer fallback
class XMLSerializer {
  serializeToString(node: Document | Element): string {
    let xml = "";
    
    if (node.nodeType === 1) { // Element node
      const el = node as Element;
      xml += "<" + el.tagName;
      
      // Serialize attributes
      if (el.attributes) {
        for (let i = 0; i < el.attributes.length; i++) {
          const attr = el.attributes[i];
          xml += ` ${attr.name}="${this.escapeXml(attr.value)}"`;
        }
      }
      
      // Serialize children
      if (el.childNodes.length > 0) {
        xml += ">";
        for (let i = 0; i < el.childNodes.length; i++) {
          xml += this.serializeToString(el.childNodes[i] as Element);
        }
        xml += "</" + el.tagName + ">";
      } else {
        xml += "/>";
      }
    } else if (node.nodeType === 3) { // Text node
      xml += this.escapeXml(node.textContent || "");
    } else if (node.nodeType === 8) { // Comment
      xml += "<!--" + node.textContent + "-->";
    }
    
    return xml;
  }
  
  escapeXml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }
}

function repackageZip(files: Map<string, string | Uint8Array>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [path, content] of files) {
    if (typeof content === "string") {
      zip.file(path, content);
    } else {
      zip.file(path, content);
    }
  }
  return zip.generateAsync({ type: "nodebuffer" });
}