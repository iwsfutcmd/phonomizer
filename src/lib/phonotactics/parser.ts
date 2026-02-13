import type { PhonotacticPattern } from '../types';

export interface PhonemesFileResult {
  phonemes: string[];
  phonotactics: PhonotacticPattern[] | null;
}

/**
 * Parses a .phonemes file, handling both legacy (flat list) and
 * section-based formats.
 *
 * Legacy format:
 *   a aː b d h i iː j k
 *
 * Section-based format:
 *   [inventory]
 *   a aː b d h i iː j k
 *
 *   [phonotactics]
 *   C = [b d h j k];
 *   V = [a aː i iː];
 *   CV
 *   CVC
 */
export function parsePhonemesFile(text: string): PhonemesFileResult {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { phonemes: [], phonotactics: null };
  }

  // Detect section-based format
  if (trimmed.includes('[inventory]')) {
    return parseSectionFormat(trimmed);
  }

  // Legacy format: flat list of phonemes
  return {
    phonemes: parsePhonemeList(trimmed),
    phonotactics: null,
  };
}

function parsePhonemeList(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

function parseSectionFormat(text: string): PhonemesFileResult {
  const sections = new Map<string, string>();
  let currentSection = '';
  const lines = text.split('\n');

  for (const line of lines) {
    const sectionMatch = line.trim().match(/^\[(\w+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      sections.set(currentSection, '');
    } else if (currentSection) {
      const existing = sections.get(currentSection) || '';
      sections.set(currentSection, existing + (existing ? '\n' : '') + line);
    }
  }

  const inventoryText = sections.get('inventory') || '';
  const phonemes = parsePhonemeList(inventoryText);

  const phonotacticsText = sections.get('phonotactics');
  let phonotactics: PhonotacticPattern[] | null = null;

  if (phonotacticsText !== undefined) {
    phonotactics = parsePhonotacticsSection(phonotacticsText.trim(), phonemes);
  }

  return { phonemes, phonotactics };
}

/**
 * Parses the [phonotactics] section.
 *
 * Lines with `=` are variable definitions.
 * Other non-empty lines are pattern definitions.
 */
function parsePhonotacticsSection(text: string, phonemes: string[]): PhonotacticPattern[] {
  const variables = new Map<string, string[]>();
  const patternLines: string[] = [];

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    if (trimmed.includes('=')) {
      parseVariableDefinition(trimmed, variables);
    } else {
      // Strip trailing semicolon from pattern lines (consistent with variable syntax)
      patternLines.push(trimmed.replace(/;$/, ''));
    }
  }

  // Build the token dictionary: variable names + phoneme names, sorted longest first
  const tokenMap = new Map<string, string[]>();

  // Variables expand to their class
  for (const [name, members] of variables) {
    tokenMap.set(name, members);
  }

  // Phonemes are single-element arrays
  for (const p of phonemes) {
    if (!tokenMap.has(p)) {
      tokenMap.set(p, [p]);
    }
  }

  const tokenNames = Array.from(tokenMap.keys()).sort((a, b) => b.length - a.length);

  // Parse each pattern line
  const patterns: PhonotacticPattern[] = [];
  for (const patternLine of patternLines) {
    const positions = tokenizePattern(patternLine, tokenNames, tokenMap);
    if (positions.length > 0) {
      patterns.push({ positions });
    }
  }

  return patterns;
}

/**
 * Parses a variable definition like:
 *   C = [b d h j k];
 *   V = [a aː i iː];
 *   X = th;
 */
function parseVariableDefinition(line: string, variables: Map<string, string[]>): void {
  // Remove trailing semicolon
  const cleaned = line.replace(/;$/, '').trim();
  const eqIndex = cleaned.indexOf('=');
  if (eqIndex === -1) return;

  const name = cleaned.substring(0, eqIndex).trim();
  const value = cleaned.substring(eqIndex + 1).trim();

  if (value.startsWith('[') && value.endsWith(']')) {
    // Class definition: [a b c]
    const inner = value.slice(1, -1).trim();
    const tokens = inner.split(/\s+/).filter(t => t.length > 0);

    // Resolve variable references within the class
    const expanded: string[] = [];
    for (const token of tokens) {
      if (variables.has(token)) {
        expanded.push(...variables.get(token)!);
      } else {
        expanded.push(token);
      }
    }
    variables.set(name, expanded);
  } else {
    // Single value or variable reference
    if (variables.has(value)) {
      variables.set(name, variables.get(value)!);
    } else {
      variables.set(name, [value]);
    }
  }
}

/**
 * Tokenizes a pattern string (e.g., "CVC") into an array of positions,
 * where each position is the set of allowed phonemes.
 *
 * Uses greedy longest-match against variable names and phoneme names.
 */
function tokenizePattern(
  pattern: string,
  tokenNames: string[],
  tokenMap: Map<string, string[]>
): string[][] {
  const positions: string[][] = [];
  let pos = 0;

  while (pos < pattern.length) {
    let matched = false;

    for (const name of tokenNames) {
      if (pattern.substring(pos, pos + name.length) === name) {
        positions.push(tokenMap.get(name)!);
        pos += name.length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      throw new Error(
        `Cannot parse phonotactic pattern "${pattern}": unrecognized token at position ${pos} ("${pattern[pos]}")`
      );
    }
  }

  return positions;
}
