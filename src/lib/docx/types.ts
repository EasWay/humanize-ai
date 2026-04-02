// Types for the DOCX AST — lossless document model
// Content and formatting are strictly separated

export interface RunStyle {
  bold: boolean | null;
  italic: boolean | null;
  underline: string | null;
  font: string | null;
  size: number | null; // half-points (24 = 12pt)
  color: string | null;
  highlight: string | null;
  styleId: string | null;
}

export interface ParagraphStyle {
  styleId: string | null;
  alignment: string | null;
  indentFirstLine: number | null;
  indentLeft: number | null;
  indentRight: number | null;
  spacingBefore: number | null;
  spacingAfter: number | null;
  lineSpacing: number | null;
}

export interface NumberingRef {
  numId: string;
  level: number;
}

export interface TextRun {
  id: string;
  text: string;
  originalText: string;
  rewrittenText: string | null;
  style: RunStyle;
  // XML path for precise replacement
  xmlPath: string;
  runIndex: number;
}

export interface ParagraphNode {
  id: string;
  style: ParagraphStyle;
  numbering: NumberingRef | null;
  runs: TextRun[];
  // For tables
  isTableCell: boolean;
  tableContext?: { tableIdx: number; rowIdx: number; cellIdx: number };
  // For headers/footers
  sectionType?: 'header' | 'footer' | 'body';
  sectionRef?: string;
}

export interface TableCell {
  id: string;
  paragraphs: ParagraphNode[];
  colspan: number;
  rowspan: number;
  width: number | null; // twips
  styleId: string | null;
}

export interface TableRow {
  id: string;
  cells: TableCell[];
  isHeader: boolean;
}

export interface TableNode {
  id: string;
  rows: TableRow[];
  width: number | null;
}

export interface ImageNode {
  id: string;
  relationshipId: string;
  name: string;
  data: Uint8Array;
  width: number | null;
  height: number | null;
}

export interface HeaderFooter {
  type: 'header' | 'footer';
  id: string;
  relationshipId: string;
  xml: string;
  paragraphs: ParagraphNode[];
}

export interface DocxDocument {
  // Raw zip contents
  files: Map<string, string | Uint8Array>;
  // Key XML documents
  documentXml: string;
  stylesXml: string;
  numberingXml: string | null;
  // Parsed structure
  paragraphs: ParagraphNode[];
  tables: TableNode[];
  images: ImageNode[];
  headers: HeaderFooter[];
  footers: HeaderFooter[];
  // Relationships
  relationships: Map<string, { id: string; type: string; target: string }>;
  // Content types
  contentTypesXml: string;
}

export interface ProtectedToken {
  original: string;
  placeholder: string;
  type: 'citation' | 'url' | 'reference' | 'number' | 'email' | 'name';
  start: number;
  end: number;
}

export interface TextBlock {
  text: string;
  paragraphIdx: number;
  runIndices: number[];
  isTableCell: boolean;
  tableContext?: { tableIdx: number; rowIdx: number; cellIdx: number };
  protectedTokens: ProtectedToken[];
}

export interface RewriteResult {
  original: string;
  rewritten: string;
  blockIdx: number;
}
