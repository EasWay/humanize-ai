// DOCX Parser — Extract .docx XML into a structured AST
import JSZip from "jszip";
import { XMLParser, XMLBuilder } from "fast-xml-parser";
import type {
  DocxDocument, ParagraphNode, TextRun, TableNode, TableRow, TableCell,
  RunStyle, ParagraphStyle, NumberingRef, HeaderFooter, ImageNode
} from "./types";

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  parseTagValue: false,
  trimValues: false,
});

let runIdCounter = 0;
let paraIdCounter = 0;
let tableIdCounter = 0;

function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// --- Style extraction ---

interface StyleDef {
  id: string;
  type: string;
  basedOn: string | null;
  runProps: Record<string, unknown>;
  paraProps: Record<string, unknown>;
}

function parseStyles(stylesXml: string): Map<string, StyleDef> {
  const styles = new Map<string, StyleDef>();
  if (!stylesXml) return styles;

  const parsed = xmlParser.parse(stylesXml);
  const styleList = parsed?.["w:styles"]?.["w:style"];
  if (!styleList) return styles;

  const arr = Array.isArray(styleList) ? styleList : [styleList];
  for (const s of arr) {
    const styleId = s?.["w:styleId"]?.["#text"] || s?.["@_w:styleId"] || "";
    const type = s?.["@_w:type"] || "";
    const basedOn = s?.["w:basedOn"]?.["@_w:val"] || null;
    const rPr = s?.["w:rPr"] || null;
    const pPr = s?.["w:pPr"] || null;
    if (styleId) {
      styles.set(styleId.toLowerCase(), { id: styleId, type, basedOn, runProps: rPr, paraProps: pPr });
    }
  }
  return styles;
}

// --- Run style extraction ---

function extractRunStyle(rPr: Record<string, unknown> | undefined | null): RunStyle {
  if (!rPr) return { bold: null, italic: null, underline: null, font: null, size: null, color: null, highlight: null, styleId: null };

  const bold = rPr["w:b"] !== undefined ? true : null;
  const italic = rPr["w:i"] !== undefined ? true : null;
  const underline = rPr["w:u"] ? (rPr["w:u"] as Record<string, unknown>)["@_w:val"] as string || "single" : null;

  let font: string | null = null;
  const rFonts = rPr["w:rFonts"] as Record<string, unknown> | undefined;
  if (rFonts) font = (rFonts["@_w:ascii"] || rFonts["@_w:hAnsi"] || rFonts["@_w:cs"]) as string || null;

  let size: number | null = null;
  const sz = rPr["w:sz"] as Record<string, unknown> | undefined;
  if (sz) size = parseInt(sz["@_w:val"] as string) || null;

  let color: string | null = null;
  const colorEl = rPr["w:color"] as Record<string, unknown> | undefined;
  if (colorEl) color = colorEl["@_w:val"] as string || null;

  let highlight: string | null = null;
  const hl = rPr["w:highlight"] as Record<string, unknown> | undefined;
  if (hl) highlight = hl["@_w:val"] as string || null;

  let styleId: string | null = null;
  const rStyle = rPr["w:rStyle"] as Record<string, unknown> | undefined;
  if (rStyle) styleId = rStyle["@_w:val"] as string || null;

  return { bold, italic, underline, font, size, color, highlight, styleId };
}

function extractParaStyle(pPr: Record<string, unknown> | undefined | null): ParagraphStyle {
  if (!pPr) return { styleId: null, alignment: null, indentFirstLine: null, indentLeft: null, indentRight: null, spacingBefore: null, spacingAfter: null, lineSpacing: null };

  let styleId: string | null = null;
  const pStyle = pPr["w:pStyle"] as Record<string, unknown> | undefined;
  if (pStyle) styleId = pStyle["@_w:val"] as string || null;

  let alignment: string | null = null;
  const jc = pPr["w:jc"] as Record<string, unknown> | undefined;
  if (jc) alignment = jc["@_w:val"] as string || null;

  let indentFirstLine: number | null = null;
  let indentLeft: number | null = null;
  let indentRight: number | null = null;
  const ind = pPr["w:ind"] as Record<string, unknown> | undefined;
  if (ind) {
    if (ind["@_w:firstLine"] !== undefined) indentFirstLine = parseInt(ind["@_w:firstLine"] as string) || 0;
    if (ind["@_w:left"] !== undefined) indentLeft = parseInt(ind["@_w:left"] as string) || 0;
    if (ind["@_w:right"] !== undefined) indentRight = parseInt(ind["@_w:right"] as string) || 0;
  }

  let spacingBefore: number | null = null;
  let spacingAfter: number | null = null;
  let lineSpacing: number | null = null;
  const spacing = pPr["w:spacing"] as Record<string, unknown> | undefined;
  if (spacing) {
    if (spacing["@_w:before"] !== undefined) spacingBefore = parseInt(spacing["@_w:before"] as string) || 0;
    if (spacing["@_w:after"] !== undefined) spacingAfter = parseInt(spacing["@_w:after"] as string) || 0;
    if (spacing["@_w:line"] !== undefined) lineSpacing = parseInt(spacing["@_w:line"] as string) || 0;
  }

  let numbering: NumberingRef | null = null;
  const numPr = pPr["w:numPr"] as Record<string, unknown> | undefined;
  if (numPr) {
    const numId = (numPr["w:numId"] as Record<string, unknown>)?.["@_w:val"] as string;
    const level = (numPr["w:ilvl"] as Record<string, unknown>)?.["@_w:val"] as string;
    if (numId) numbering = { numId, level: parseInt(level) || 0 };
  }

  return { styleId, alignment, indentFirstLine, indentLeft, indentRight, spacingBefore, spacingAfter, lineSpacing };
}

// --- Paragraph extraction ---

function extractParagraphs(body: Record<string, unknown>, styles: Map<string, StyleDef>): ParagraphNode[] {
  const paragraphs: ParagraphNode[] = [];
  const pElements = body["w:p"];
  if (!pElements) return paragraphs;

  const pArr = Array.isArray(pElements) ? pElements : [pElements];
  for (const p of pArr) {
    const pPr = p["w:pPr"] as Record<string, unknown> | undefined;
    const paraStyle = extractParaStyle(pPr);

    const runs: TextRun[] = [];
    const rElements = p["w:r"];
    if (rElements) {
      const rArr = Array.isArray(rElements) ? rElements : [rElements];
      for (let ri = 0; ri < rArr.length; ri++) {
        const r = rArr[ri];
        const rPr = r["w:rPr"] as Record<string, unknown> | undefined;
        const runStyle = extractRunStyle(rPr);

        // Extract text from w:t elements
        const tElements = r["w:t"];
        if (tElements) {
          const tArr = Array.isArray(tElements) ? tElements : [tElements];
          let combinedText = "";
          for (const t of tArr) {
            if (typeof t === "string") combinedText += t;
            else if (t && typeof t === "object" && "#text" in t) combinedText += (t as Record<string, unknown>)["#text"];
          }
          if (combinedText) {
            runs.push({
              id: uid("r"),
              text: combinedText,
              originalText: combinedText,
              rewrittenText: null,
              style: runStyle,
              xmlPath: "",
              runIndex: ri,
            });
          }
        }

        // Also check for w:tab, w:br, etc. as text separators
        const tabEl = r["w:tab"];
        if (tabEl && runs.length > 0) {
          runs[runs.length - 1].text += "\t";
          runs[runs.length - 1].originalText += "\t";
        }
      }
    }

    // Extract numbering separately
    let numbering: NumberingRef | null = null;
    const numPr = pPr?.["w:numPr"] as Record<string, unknown> | undefined;
    if (numPr) {
      const numId = (numPr["w:numId"] as Record<string, unknown>)?.["@_w:val"] as string;
      const level = (numPr["w:ilvl"] as Record<string, unknown>)?.["@_w:val"] as string;
      if (numId) numbering = { numId, level: parseInt(level) || 0 };
    }

    paragraphs.push({
      id: uid("p"),
      style: paraStyle,
      numbering,
      runs,
      isTableCell: false,
    });
  }

  return paragraphs;
}

// --- Table extraction ---

function extractTables(body: Record<string, unknown>, styles: Map<string, StyleDef>): TableNode[] {
  const tables: TableNode[] = [];
  const tblElements = body["w:tbl"];
  if (!tblElements) return tables;

  const tblArr = Array.isArray(tblElements) ? tblElements : [tblElements];
  for (const tbl of tblArr) {
    const rows: TableRow[] = [];
    const trElements = tbl["w:tr"];
    if (!trElements) continue;

    const trArr = Array.isArray(trElements) ? trElements : [trElements];
    for (let ri = 0; ri < trArr.length; ri++) {
      const tr = trArr[ri];
      const isHeader = !!tr["w:trPr"]?.["w:tblHeader"];
      const cells: TableCell[] = [];

      const tcElements = tr["w:tc"];
      if (!tcElements) continue;
      const tcArr = Array.isArray(tcElements) ? tcElements : [tcElements];

      for (let ci = 0; ci < tcArr.length; ci++) {
        const tc = tcArr[ci];
        // Extract cell paragraphs
        const cellBody = { "w:p": tc["w:p"], "w:tbl": tc["w:tbl"] }; // nested tables
        const cellParagraphs = extractParagraphs(cellBody, styles);
        for (const cp of cellParagraphs) {
          cp.isTableCell = true;
          cp.tableContext = { tableIdx: tables.length, rowIdx: ri, cellIdx: ci };
        }

        // Cell width
        let width: number | null = null;
        const tcW = tc["w:tcPr"]?.["w:tcW"] as Record<string, unknown> | undefined;
        if (tcW) width = parseInt(tcW["@_w:w"] as string) || null;

        // Cell style
        let styleId: string | null = null;
        const tcStyle = tc["w:tcPr"]?.["w:tcStyle"] as Record<string, unknown> | undefined;
        if (tcStyle) styleId = tcStyle["@_w:val"] as string || null;

        // Colspan
        let colspan = 1;
        const gridSpan = tc["w:tcPr"]?.["w:gridSpan"] as Record<string, unknown> | undefined;
        if (gridSpan) colspan = parseInt(gridSpan["@_w:val"] as string) || 1;

        // Rowspan
        let rowspan = 1;
        const vMerge = tc["w:tcPr"]?.["w:vMerge"] as Record<string, unknown> | undefined;
        if (vMerge && !vMerge["@_w:val"]) rowspan = 1; // continuation — simplify for now

        cells.push({
          id: uid("tc"),
          paragraphs: cellParagraphs,
          colspan,
          rowspan,
          width,
          styleId,
        });
      }

      rows.push({ id: uid("tr"), cells, isHeader });
    }

    // Table width
    let tableWidth: number | null = null;
    const tblW = tbl["w:tblPr"]?.["w:tblW"] as Record<string, unknown> | undefined;
    if (tblW) tableWidth = parseInt(tblW["@_w:w"] as string) || null;

    tables.push({ id: uid("tbl"), rows, width: tableWidth });
  }

  return tables;
}

// --- Image extraction ---

function extractImages(zip: JSZip, relationships: Map<string, { id: string; type: string; target: string }>): ImageNode[] {
  const images: ImageNode[] = [];
  for (const [id, rel] of relationships) {
    if (rel.type.includes("image")) {
      const imgPath = `word/${rel.target}`;
      const file = zip.file(imgPath);
      if (file) {
        const data = file as unknown as { async(type: string): Promise<Uint8Array> };
        // We'll store the relationship ID for reconstruction
        images.push({
          id: uid("img"),
          relationshipId: id,
          name: rel.target.split("/").pop() || "image",
          data: new Uint8Array(0), // Lazy load
          width: null,
          height: null,
        });
      }
    }
  }
  return images;
}

// --- Relationships parsing ---

function parseRelationships(relsXml: string): Map<string, { id: string; type: string; target: string }> {
  const rels = new Map<string, { id: string; type: string; target: string }>();
  if (!relsXml) return rels;

  const parsed = xmlParser.parse(relsXml);
  const relList = parsed?.["Relationships"]?.["Relationship"];
  if (!relList) return rels;

  const arr = Array.isArray(relList) ? relList : [relList];
  for (const r of arr) {
    const id = r["@_Id"] || "";
    const type = r["@_Type"] || "";
    const target = r["@_Target"] || "";
    if (id) rels.set(id, { id, type, target });
  }
  return rels;
}

// --- Header/Footer extraction ---

function extractHeaderFooter(
  zip: JSZip,
  path: string,
  relId: string,
  type: "header" | "footer",
  styles: Map<string, StyleDef>
): HeaderFooter | null {
  const file = zip.file(path);
  if (!file) return null;

  // Can't use async here easily, so we'll store the raw XML
  // and parse it synchronously
  return null; // Placeholder — will be handled in the main parse function
}

// --- Main parser ---

export async function parseDocx(buffer: Buffer): Promise<DocxDocument> {
  const zip = await JSZip.loadAsync(buffer);
  const files = new Map<string, string | Uint8Array>();

  // Read all files
  const fileEntries = Object.keys(zip.files);
  for (const path of fileEntries) {
    const file = zip.file(path);
    if (!file) continue;
    if (path.endsWith(".xml") || path.endsWith(".rels") || path.endsWith("[Content_Types].xml")) {
      files.set(path, await file.async("string"));
    } else {
      files.set(path, await file.async("uint8array"));
    }
  }

  const documentXml = files.get("word/document.xml") as string || "";
  const stylesXml = files.get("word/styles.xml") as string || "";
  const numberingXml = files.get("word/numbering.xml") as string || null;
  const contentTypesXml = files.get("[Content_Types].xml") as string || "";

  // Parse relationships
  const relsXml = files.get("word/_rels/document.xml.rels") as string || "";
  const relationships = parseRelationships(relsXml);

  // Parse styles
  const styles = parseStyles(stylesXml);

  // Parse document body
  const docParsed = xmlParser.parse(documentXml);
  const body = docParsed?.["w:document"]?.["w:body"] || {};

  // Extract paragraphs and tables in document order
  const paragraphs = extractParagraphs(body, styles);
  const tables = extractTables(body, styles);

  // Mark table cell paragraphs
  for (const table of tables) {
    for (const row of table.rows) {
      for (const cell of row.cells) {
        paragraphs.push(...cell.paragraphs);
      }
    }
  }

  // Extract images
  const images = extractImages(zip, relationships);

  return {
    files,
    documentXml,
    stylesXml,
    numberingXml,
    contentTypesXml,
    relationships,
    paragraphs,
    tables,
    images,
    headers: [],
    footers: [],
  };
}

// --- Text block extraction (for rewriting) ---

import type { TextBlock, ProtectedToken } from "./types";

export function extractTextBlocks(doc: DocxDocument): TextBlock[] {
  const blocks: TextBlock[] = [];

  for (let pi = 0; pi < doc.paragraphs.length; pi++) {
    const para = doc.paragraphs[pi];
    if (para.runs.length === 0) continue;

    // Combine consecutive runs from same paragraph into one block
    const combinedText = para.runs.map(r => r.text).join("");
    if (!combinedText.trim()) continue;

    blocks.push({
      text: combinedText,
      paragraphIdx: pi,
      runIndices: para.runs.map((_, i) => i),
      isTableCell: para.isTableCell,
      tableContext: para.tableContext,
      protectedTokens: [],
    });
  }

  return blocks;
}

export { xmlParser };
