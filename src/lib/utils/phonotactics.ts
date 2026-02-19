/**
 * Parser and validator for phoneme files with phonotactic constraints
 *
 * File format:
 * [inventory]
 * phoneme1 phoneme2 phoneme3
 *
 * [phonotactics]
 * CLASS = [phoneme1 phoneme2];
 * PATTERN1
 * PATTERN2
 */

export interface PhonemeFileData {
  inventory: string[];
  patterns: string[];
  variables: Map<string, string>;
}

/**
 * Parses a phoneme file with optional [inventory] and [phonotactics] sections
 *
 * Backward compatible: if no sections found, treats entire file as inventory
 */
export function parsePhonemeFile(fileContent: string): PhonemeFileData {
  const lines = fileContent.split('\n').map(l => l.trim());

  // Check if file uses sections
  const hasSections = lines.some(l => l.startsWith('['));

  if (!hasSections) {
    // Backward compatible: just a space-separated list of phonemes
    const phonemes = fileContent.trim().split(/[\s,]+/).filter(p => p);
    return {
      inventory: phonemes,
      patterns: [],
      variables: new Map()
    };
  }

  // Parse sections
  let currentSection: 'none' | 'inventory' | 'phonotactics' = 'none';
  const inventory: string[] = [];
  const patterns: string[] = [];
  const variables = new Map<string, string>();

  for (const line of lines) {
    // Skip empty lines and comments
    if (line === '' || line.startsWith('#')) continue;

    // Check for section headers
    if (line === '[inventory]') {
      currentSection = 'inventory';
      continue;
    } else if (line === '[phonotactics]') {
      currentSection = 'phonotactics';
      continue;
    }

    // Process line based on current section
    if (currentSection === 'inventory') {
      // Parse phonemes (space or comma separated)
      const phonemes = line.split(/[\s,]+/).filter(p => p);
      inventory.push(...phonemes);
    } else if (currentSection === 'phonotactics') {
      // Check if it's a variable definition (contains =)
      const eqIndex = line.indexOf('=');
      if (eqIndex !== -1 && line.endsWith(';')) {
        // Variable definition
        const name = line.substring(0, eqIndex).trim();
        const value = line.substring(eqIndex + 1, line.length - 1).trim(); // Remove semicolon
        variables.set(name, value);
      } else if (line !== '') {
        // Pattern (just a line of text like "CV" or "CVC")
        patterns.push(line);
      }
    }
  }

  return { inventory, patterns, variables };
}

/**
 * Flattens nested class notation into array of phonemes
 * Reused from parser.ts logic
 */
function flattenNestedClass(str: string): string[] {
  const trimmed = str.trim();

  // Base case: single phoneme (no brackets)
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return [trimmed];
  }

  // Remove outer brackets
  const content = trimmed.slice(1, -1).trim();
  if (content === '') {
    throw new Error('Class cannot be empty: "[]"');
  }

  // Parse tokens handling nested brackets
  const result: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of content) {
    if (char === '[') {
      depth++;
      current += char;
    } else if (char === ']') {
      depth--;
      current += char;
    } else if (/\s/.test(char) && depth === 0) {
      // Space at depth 0: token boundary
      if (current) {
        result.push(...flattenNestedClass(current));
        current = '';
      }
    } else {
      current += char;
    }
  }

  // Don't forget the last token
  if (current) {
    result.push(...flattenNestedClass(current));
  }

  return result;
}

/**
 * Checks if a word matches a phonotactic pattern.
 *
 * Pattern syntax: space-separated tokens, e.g. "C V" or "I F T"
 * Each token is either a variable name (expands to its phoneme class)
 * or a literal phoneme.
 */
function matchesPattern(
  word: string,
  pattern: string,
  variables: Map<string, string>,
  phonemes: string[]
): boolean {
  // Tokenize the word using greedy longest-match
  const wordTokens = tokenize(word, phonemes);

  // Strip optional trailing semicolon and split pattern into tokens
  const patternTokens = pattern.replace(/;$/, '').trim().split(/\s+/).filter(t => t);

  if (wordTokens.length !== patternTokens.length) {
    return false;
  }

  for (let i = 0; i < wordTokens.length; i++) {
    const token = patternTokens[i];
    const allowed = variables.has(token)
      ? flattenNestedClass(variables.get(token)!)
      : [token];

    if (!allowed.includes(wordTokens[i])) {
      return false;
    }
  }

  return true;
}

/**
 * Tokenizes a word using greedy longest-match
 */
function tokenize(word: string, phonemes: string[]): string[] {
  if (word === '') return [];

  const sortedPhonemes = [...phonemes].sort((a, b) => b.length - a.length);
  const tokens: string[] = [];
  let pos = 0;

  while (pos < word.length) {
    let matched = false;

    for (const phoneme of sortedPhonemes) {
      if (word.substring(pos, pos + phoneme.length) === phoneme) {
        tokens.push(phoneme);
        pos += phoneme.length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      throw new Error(`Cannot tokenize: character(s) at position ${pos} do not match any phoneme`);
    }
  }

  return tokens;
}

/**
 * Checks if a word is phonotactically valid according to the patterns
 *
 * Returns true if:
 * - No patterns are defined (backward compatible)
 * - Word matches at least one pattern
 */
export function isPhonotacticallyValid(
  word: string,
  phonemeData: PhonemeFileData
): boolean {
  // No patterns = no constraints (backward compatible)
  if (phonemeData.patterns.length === 0) {
    return true;
  }

  // Check if word matches any pattern
  for (const pattern of phonemeData.patterns) {
    try {
      if (matchesPattern(word, pattern, phonemeData.variables, phonemeData.inventory)) {
        return true;
      }
    } catch (e) {
      // If tokenization fails, pattern doesn't match
      continue;
    }
  }

  return false;
}
