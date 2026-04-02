// Protected tokens — detect and preserve citations, URLs, references, numbers
import type { ProtectedToken } from "./types";

// Citation patterns
const CITATION_PATTERNS = [
  // [1], [2,3], [1-5]
  /\[\d+(?:\s*[-–,]\s*\d+)*\]/g,
  // (Author, Year), (Author & Author, Year)
  /\([A-Z][a-z]+(?:\s+(?:&|and)\s+[A-Z][a-z]+)?,?\s*\d{4}[a-z]?\)/g,
  // 【12】
  /【\d+】/g,
  // (see Author, Year, p. 14)
  /\(see\s+[A-Z][a-z]+(?:\s+(?:&|and)\s+[A-Z][a-z]+)?,?\s*\d{4}[a-z]?,?\s*(?:p\.?\s*\d+)?\)/g,
  // Superscript-style: ¹ ² ³
  /[¹²³⁴⁵⁶⁷⁸⁹⁰]+/g,
];

// URL pattern
const URL_PATTERN = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;

// Email pattern
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Reference patterns (bibliography entries)
const REFERENCE_PATTERNS = [
  // Smith, J. (2023). Title...
  /^[A-Z][a-z]+,\s*[A-Z]\.\s*\(\d{4}\)\.\s*.+/gm,
  // Smith, J., & Jones, K. (2023)...
  /^[A-Z][a-z]+,\s*[A-Z]\.,\s*(?:&|and)\s*[A-Z][a-z]+,\s*[A-Z]\.\s*\(\d{4}\)\.\s*.+/gm,
];

// Number patterns (conservative — only standalone numbers that look meaningful)
const NUMBER_PATTERN = /\b\d{4}\b|\b\d+\.\d+\b/g; // years and decimals

// Placeholder generator
let tokenCounter = 0;
function makePlaceholder(type: string): string {
  tokenCounter++;
  return `⟨${type.toUpperCase()}_${tokenCounter}⟩`;
}

export function protectTokens(text: string): { text: string; tokens: ProtectedToken[] } {
  tokenCounter = 0;
  const tokens: ProtectedToken[] = [];
  let protectedText = text;

  // Sort by position (descending) to replace from end to start
  const allMatches: ProtectedToken[] = [];

  // Find citations
  for (const pattern of CITATION_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      allMatches.push({
        original: match[0],
        placeholder: makePlaceholder("cite"),
        type: "citation",
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  // Find URLs
  URL_PATTERN.lastIndex = 0;
  let urlMatch;
  while ((urlMatch = URL_PATTERN.exec(text)) !== null) {
    allMatches.push({
      original: urlMatch[0],
      placeholder: makePlaceholder("url"),
      type: "url",
      start: urlMatch.index,
      end: urlMatch.index + urlMatch[0].length,
    });
  }

  // Find emails
  EMAIL_PATTERN.lastIndex = 0;
  let emailMatch;
  while ((emailMatch = EMAIL_PATTERN.exec(text)) !== null) {
    allMatches.push({
      original: emailMatch[0],
      placeholder: makePlaceholder("email"),
      type: "email",
      start: emailMatch.index,
      end: emailMatch.index + emailMatch[0].length,
    });
  }

  // Sort by start position descending
  allMatches.sort((a, b) => b.start - a.start);

  // Remove overlapping matches (keep the first found)
  const filtered: ProtectedToken[] = [];
  let lastEnd = text.length;
  for (const m of allMatches) {
    if (m.end <= lastEnd) {
      filtered.push(m);
      lastEnd = m.start;
    }
  }

  // Apply replacements from end to start
  filtered.sort((a, b) => b.start - a.start);
  for (const token of filtered) {
    protectedText =
      protectedText.slice(0, token.start) +
      token.placeholder +
      protectedText.slice(token.end);
    tokens.push(token);
  }

  return { text: protectedText, tokens: tokens.reverse() };
}

export function restoreTokens(text: string, tokens: ProtectedToken[]): string {
  let restored = text;
  for (const token of tokens) {
    // Be flexible with whitespace around placeholders
    const escaped = token.placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\s*${escaped}\\s*`, "g");
    // Try exact match first
    if (restored.includes(token.placeholder)) {
      restored = restored.replace(token.placeholder, token.original);
    } else {
      // Try flexible match
      restored = restored.replace(regex, ` ${token.original} `);
    }
  }
  return restored;
}
