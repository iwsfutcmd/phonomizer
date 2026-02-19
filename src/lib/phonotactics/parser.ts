import type { PhonotacticPattern } from '../types';

export interface PhonemesFileResult {
  phonemes: string[];
  phonotactics: PhonotacticPattern[] | null;
}

/**
 * Parses a phoneme data file. Handles three formats, detected automatically:
 *
 * 1. Legacy flat list (.phonemes):
 *      a aː b d h i iː j k
 *
 * 2. Phonotactics-only (.phonotactics) — preferred format:
 *      C = [b d h j k]
 *      V = [a aː i iː]
 *
 *      C V         (spaces between tokens are allowed)
 *      C V C
 *      (C) V (C)   (optional groups)
 *
 *    Phoneme inventory is derived from the union of all variable values.
 *    ∅ and # are filtered out (they are position markers, not phonemes).
 *
 * 3. Legacy section-based (.phonemes with sections):
 *      [inventory]
 *      a aː b d h i iː j k
 *
 *      [phonotactics]
 *      C = [b d h j k]
 *      V = [a aː i iː]
 *      CV
 *      CVC
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

  // Detect phonotactics-only format: has variable definition lines (NAME = ...)
  const hasVarDefs = trimmed.split('\n')
    .some(line => /^\s*\w[\w-]*\s*=/.test(line.replace(/;$/, '').trim()));
  if (hasVarDefs) {
    return parsePhonotacticsFile(trimmed);
  }

  // Legacy format: flat list of phonemes
  return {
    phonemes: parsePhonemeList(trimmed),
    phonotactics: null,
  };
}

/**
 * Parses a .phonotactics file: variable definitions + pattern lines, no section headers.
 * The phoneme inventory is derived from the union of all variable values (∅ and # excluded).
 *
 * Format:
 *   C = [p t k]
 *   V = [a e i o u]
 *   N = [m n]
 *
 *   C V           (space-separated tokens — equivalent to CV)
 *   C V C
 *   (C) V (N)     (optional groups: expands to CV N, CV, VN, V)
 *   (C (N)) V     (nested optionals: expands to CNV, CV, V)
 *
 * Any [sectionHeader] lines (e.g. [phonotactics]) are silently ignored.
 */
export function parsePhonotacticsFile(text: string): PhonemesFileResult {
  // Strip section header lines (e.g. [phonotactics]) for graceful handling
  const stripped = text.split('\n')
    .filter(line => !/^\[\w+\]$/.test(line.trim()))
    .join('\n');

  // Parse variables to derive the phoneme inventory
  const variables = new Map<string, string[]>();
  for (const line of stripped.split('\n')) {
    const trimmed = line.trim().replace(/;$/, '');
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    if (trimmed.includes('=')) parseVariableDefinition(trimmed, variables);
  }

  const phonemes = derivePhonemes(variables);
  const phonotactics = parsePhonotacticsSection(stripped, []);
  return { phonemes, phonotactics: phonotactics.length > 0 ? phonotactics : null };
}

/**
 * Derives a phoneme inventory from the union of all variable values.
 * Filters out special markers (∅, #) that are not real phonemes.
 */
function derivePhonemes(variables: Map<string, string[]>): string[] {
  const MARKERS = new Set(['∅', '#']);
  const all = new Set<string>();
  for (const values of variables.values()) {
    for (const v of values) {
      if (!MARKERS.has(v)) all.add(v);
    }
  }
  return Array.from(all).sort();
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
 * Expands optional groups (X) in a phonotactic pattern string into all variants.
 * Each variant is a string with the optional group either included or excluded.
 *
 * Examples:
 * - "I (M) N" → ["I M N", "I N"]
 * - "I (M) N (SC) (T)" → 8 variants (all combinations of M, SC, T present/absent)
 * - "I ((M) N)" → ["I M N", "I N", "I"] (nested: M only valid when outer group present)
 */
function expandPatternOptionals(pattern: string): string[] {
  const segments: Array<{ type: 'fixed' | 'optional'; content: string }> = [];
  let i = 0;
  let fixedStart = 0;

  while (i < pattern.length) {
    if (pattern[i] === '(') {
      // Flush fixed content before this (
      const fixed = pattern.substring(fixedStart, i).trim();
      if (fixed) segments.push({ type: 'fixed', content: fixed });

      // Find the matching )
      let innerDepth = 0;
      let j = i + 1;
      while (j < pattern.length) {
        if (pattern[j] === '(') innerDepth++;
        else if (pattern[j] === ')') {
          if (innerDepth === 0) break;
          innerDepth--;
        }
        j++;
      }
      if (j >= pattern.length) {
        throw new Error(`Unclosed '(' in phonotactic pattern: "${pattern}"`);
      }

      const innerContent = pattern.substring(i + 1, j).trim();
      segments.push({ type: 'optional', content: innerContent });
      i = j + 1;
      fixedStart = i;
    } else {
      i++;
    }
  }

  // Flush remaining fixed content
  const remaining = pattern.substring(fixedStart).trim();
  if (remaining) segments.push({ type: 'fixed', content: remaining });

  if (segments.length === 0) return [''];

  const hasOptional = segments.some(s => s.type === 'optional');
  if (!hasOptional) {
    return [segments.map(s => s.content).join(' ')];
  }

  // Generate all combinations
  let combinations: string[][] = [[]];

  for (const segment of segments) {
    if (segment.type === 'fixed') {
      const trimmed = segment.content.trim();
      if (trimmed) {
        combinations = combinations.map(c => [...c, trimmed]);
      }
    } else {
      // Optional: recursively expand inner content
      const innerExpanded = expandPatternOptionals(segment.content);

      const newCombinations: string[][] = [];
      for (const combo of combinations) {
        // With each inner variant (present)
        for (const inner of innerExpanded) {
          if (inner.trim()) {
            newCombinations.push([...combo, inner]);
          }
        }
        // Without (absent)
        newCombinations.push([...combo]);
      }
      combinations = newCombinations;
    }
  }

  // Deduplicate and return
  const seen = new Set<string>();
  const results: string[] = [];
  for (const parts of combinations) {
    const joined = parts.filter(p => p.trim()).join(' ');
    if (!seen.has(joined)) {
      seen.add(joined);
      results.push(joined);
    }
  }

  return results;
}

/**
 * Parses a block of phonotactics content (variable definitions + pattern lines).
 *
 * Lines with `=` are variable definitions: `C = [p t k]` or `X = th`
 * Other non-empty lines are pattern definitions:
 *   - Token names are separated by whitespace (spaces are stripped before tokenizing)
 *   - `CV` and `C V` are equivalent
 *   - Optional groups: `(C) V (N)` expands to all present/absent combinations
 *   - Greedy longest-match tokenization against variable and phoneme names
 *   - A word matches if it fits ANY pattern (OR logic)
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

  // Parse each pattern line, expanding optional groups first
  const patterns: PhonotacticPattern[] = [];
  for (const patternLine of patternLines) {
    const expandedPatterns = expandPatternOptionals(patternLine);
    for (const expanded of expandedPatterns) {
      // Strip all whitespace: token names never contain spaces, so spaces are just separators
      const noSpaces = expanded.replace(/\s+/g, '');
      if (!noSpaces) continue;
      const positions = tokenizePattern(noSpaces, tokenNames, tokenMap);
      if (positions.length > 0) {
        patterns.push({ positions });
      }
    }
  }

  return patterns;
}

/**
 * Parses a variable definition like:
 *   C = [b d h j k]
 *   V = [a aː i iː]
 *   X = th
 *   STOPS = [VOICELESS VOICED]   (nested variable references, flattened)
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
