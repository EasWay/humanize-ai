// Renderer — Rebuild .docx from modified AST, preserving original XML structure
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

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  format: true,
  suppressBooleanAttributes: false,
  suppressEmptyNode: false,
});

export async function renderDocx(doc: DocxDocument): Promise<Buffer> {
  // 1. Parse the original document XML
  const parsed = xmlParser.parse(doc.documentXml);
  const body = parsed?.["w:document"]?.["w:body"];
  if (!body) throw new Error("Invalid document XML — no body found");

  // 2. Replace text in paragraphs
  replaceParagraphText(body, doc);

  // 3. Replace text in tables
  replaceTableText(body, doc);

  // 4. Rebuild the XML string
  const newDocumentXml = xmlBuilder.build(parsed);

  // 5. Create new zip with modified document.xml
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

  // 6. Generate the buffer
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return buffer;
}

function replaceParagraphText(body: Record<string, unknown>, doc: DocxDocument): void {
  const pElements = body["w:p"];
  if (!pElements) return;

  const pArr = Array.isArray(pElements) ? pElements : [pElements];
  let docParaIdx = 0;

  for (const p of pArr) {
    // Find matching paragraph in our AST
    const para = doc.paragraphs.find((dp, i) => {
      if (dp.isTableCell) return false;
      return i === docParaIdx;
    });

    if (!para) { docParaIdx++; continue; }

    const rElements = p["w:r"];
    if (!rElements) { docParaIdx++; continue; }

    const rArr = Array.isArray(rElements) ? rElements : [rElements];

    for (let ri = 0; ri < rArr.length && ri < para.runs.length; ri++) {
      const r = rArr[ri];
      const run = para.runs[ri];

      if (run.rewrittenText !== null && run.rewrittenText !== run.originalText) {
        // Replace the text content
        const tElements = r["w:t"];
        if (tElements) {
          const tArr = Array.isArray(tElements) ? tElements : [tElements];
          if (tArr.length === 1) {
            const t = tArr[0];
            if (typeof t === "object" && "#text" in t) {
              t["#text"] = run.rewrittenText;
            } else if (typeof t === "string") {
              // Replace the key in parent
              r["w:t"] = { "#text": run.rewrittenText, "@_xml:space": "preserve" };
            }
          } else {
            // Multiple t elements — distribute text
            let charIdx = 0;
            for (const t of tArr) {
              const tLen = typeof t === "string" ? t.length : ((t["#text"] as string) || "").length;
              const proportion = tLen / run.originalText.length;
              const take = Math.round(run.rewrittenText.length * proportion);
              const newText = run.rewrittenText.slice(charIdx, charIdx + take);
              if (typeof t === "object" && "#text" in t) {
                t["#text"] = newText;
              }
              charIdx += take;
            }
          }
        }
      }
    }

    docParaIdx++;
  }
}

function replaceTableText(body: Record<string, unknown>, doc: DocxDocument): void {
  const tblElements = body["w:tbl"];
  if (!tblElements) return;

  const tblArr = Array.isArray(tblElements) ? tblElements : [tblElements];
  let tableIdx = 0;

  for (const tbl of tblArr) {
    const table = doc.tables[tableIdx];
    if (!table) { tableIdx++; return; }

    const trElements = tbl["w:tr"];
    if (!trElements) { tableIdx++; continue; }

    const trArr = Array.isArray(trElements) ? trElements : [trElements];

    for (let ri = 0; ri < trArr.length && ri < table.rows.length; ri++) {
      const tr = trArr[ri];
      const row = table.rows[ri];

      const tcElements = tr["w:tc"];
      if (!tcElements) continue;
      const tcArr = Array.isArray(tcElements) ? tcElements : [tcElements];

      for (let ci = 0; ci < tcArr.length && ci < row.cells.length; ci++) {
        const tc = tcArr[ci];
        const cell = row.cells[ci];

        // Replace text in cell paragraphs
        const cellBody = { "w:p": tc["w:p"] };
        replaceCellParagraphs(cellBody, cell.paragraphs);
      }
    }

    tableIdx++;
  }
}

function replaceCellParagraphs(cellBody: Record<string, unknown>, paragraphs: Array<import("./types").ParagraphNode>): void {
  const pElements = cellBody["w:p"];
  if (!pElements) return;

  const pArr = Array.isArray(pElements) ? pElements : [pElements];

  for (let pi = 0; pi < pArr.length && pi < paragraphs.length; pi++) {
    const p = pArr[pi];
    const para = paragraphs[pi];

    const rElements = p["w:r"];
    if (!rElements) continue;
    const rArr = Array.isArray(rElements) ? rElements : [rElements];

    for (let ri = 0; ri < rArr.length && ri < para.runs.length; ri++) {
      const r = rArr[ri];
      const run = para.runs[ri];

      if (run.rewrittenText !== null && run.rewrittenText !== run.originalText) {
        const tElements = r["w:t"];
        if (tElements) {
          const tArr = Array.isArray(tElements) ? tElements : [tElements];
          if (tArr.length === 1) {
            const t = tArr[0];
            if (typeof t === "object" && "#text" in t) {
              t["#text"] = run.rewrittenText;
            } else if (typeof t === "string") {
              r["w:t"] = { "#text": run.rewrittenText, "@_xml:space": "preserve" };
            }
          }
        }
      }
    }
  }
}
