import type { Rule, PhonotacticPattern } from '../types';
import { matchesPhonotactics } from '../phonotactics/matcher';

// Separator for serializing token arrays. Must not appear in any phoneme text.
// \x01 (SOH) is safe: IPA, Latin with diacritics, digits, etc. never include it.
const SEP = '\x01';

function serializeTokens(tokens: string[]): string {
  return tokens.length === 0 ? '' : tokens.join(SEP);
}

function deserializeTokens(key: string): string[] {
  return key === '' ? [] : key.split(SEP);
}

/**
 * Tokenizes a word using a pre-sorted phoneme list (longest first).
 * Callers that tokenize many words with the same phoneme set should sort once
 * and call this, rather than calling the sort-on-every-call variant.
 */
function tokenizeWith(word: string, sortedPhonemes: string[]): string[] {
  if (word === '') return [];
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
      throw new Error(`Cannot tokenize: character(s) at position ${pos} ("${word[pos]}") do not match any phoneme`);
    }
  }
  return tokens;
}

/**
 * Tokenizes a word into phoneme tokens using greedy longest-match.
 * Sorts phonemes internally — use tokenizeWith for repeated calls.
 */
function tokenize(word: string, phonemes: string[]): string[] {
  return tokenizeWith(word, [...phonemes].sort((a, b) => b.length - a.length));
}

/**
 * Creates a reusable reverser function with shared state pre-computed once.
 *
 * Use this when reversing many words with the same rules and phoneme sets.
 * The returned function caches per-word results, so re-processing the same
 * word (e.g. on re-analysis without input changes) is O(1).
 */
export function createReverser(
  rules: Rule[],
  sourcePhonemes: string[],
  targetPhonemes: string[],
  sourcePhonotactics?: PhonotacticPattern[] | null,
  _targetPhonotactics?: PhonotacticPattern[] | null
): (word: string) => string[] {
  // Expand source phonemes to include phonemes deleted by deletion rules
  const allSourcePhonemes = new Set<string>(sourcePhonemes);
  for (const rule of rules) {
    if (rule.to.length === 0) rule.from.forEach(p => allSourcePhonemes.add(p));
  }
  const expandedSourcePhonemes = Array.from(allSourcePhonemes);

  // Sort phoneme lists once for all tokenization calls
  const sortedTargetPhonemes = [...targetPhonemes].sort((a, b) => b.length - a.length);
  const sortedSourcePhonemes = [...expandedSourcePhonemes].sort((a, b) => b.length - a.length);

  // Per-word result cache — survives across re-analysis calls as long as
  // the same createReverser instance is reused.
  const cache = new Map<string, string[]>();

  return function reverseWord(word: string): string[] {
    const cached = cache.get(word);
    if (cached !== undefined) return cached;

    let possibilityKeys: Set<string> = new Set([
      serializeTokens(tokenizeWith(word, sortedTargetPhonemes))
    ]);

    // Apply rules in reverse order
    for (let i = rules.length - 1; i >= 0; i--) {
      const rule = rules[i];
      const newKeys: Set<string> = new Set();

      for (const key of possibilityKeys) {
        const tokens = deserializeTokens(key);
        for (const reversed of reverseOneRule(tokens, rule, expandedSourcePhonemes)) {
          newKeys.add(serializeTokens(reversed));
        }
      }

      possibilityKeys = newKeys;
    }

    // Convert to final words; validate tokenization and phonotactics
    const results: string[] = [];
    for (const key of possibilityKeys) {
      const tokens = deserializeTokens(key);
      const w = tokens.join('');
      try {
        tokenizeWith(w, sortedSourcePhonemes);
      } catch {
        continue;
      }
      if (sourcePhonotactics && !matchesPhonotactics(tokens, sourcePhonotactics)) continue;
      results.push(w);
    }
    results.sort();
    cache.set(word, results);
    return results;
  };
}

/**
 * Applies phonological rules in reverse to find all possible source words
 * that could have produced the given target word.
 */
export function reverseRules(
  word: string,
  rules: Rule[],
  sourcePhonemes: string[],
  targetPhonemes: string[],
  sourcePhonotactics?: PhonotacticPattern[] | null,
  targetPhonotactics?: PhonotacticPattern[] | null
): string[] {
  return createReverser(rules, sourcePhonemes, targetPhonemes, sourcePhonotactics, targetPhonotactics)(word);
}

/**
 * Reverses a single rule application on token arrays.
 */
function reverseOneRule(tokens: string[], rule: Rule, sourcePhonemes: string[]): string[][] {
  const { from, to, leftContext, rightContext } = rule;
  const toLength = to.length;

  // Deletion rule (from → empty): reversing is insertion at all valid positions
  if (to.length === 0) {
    const results: string[][] = [];

    const fromPhonemeInSource = from.every(p => sourcePhonemes.includes(p));
    if (fromPhonemeInSource) {
      results.push(tokens);
    }

    for (let i = 0; i <= tokens.length; i++) {
      const testTokens = [...tokens.slice(0, i), ...from, ...tokens.slice(i)];
      if (matchesContextForSequence(testTokens, i, from.length, leftContext, rightContext)) {
        results.push(testTokens);
      }
    }

    return results;
  }

  // Find all positions where the target sequence appears in the token array
  const positions: number[] = [];
  for (let i = 0; i <= tokens.length - toLength; i++) {
    let sequenceMatches = true;
    for (let j = 0; j < toLength; j++) {
      if (tokens[i + j] !== to[j]) { sequenceMatches = false; break; }
    }
    if (sequenceMatches && matchesContextForSequence(tokens, i, toLength, leftContext, rightContext)) {
      positions.push(i);
    }
  }

  if (positions.length === 0) return [tokens];

  // Map from token position → positions-array index for O(1) lookup
  const positionMap = new Map<number, number>(positions.map((pos, idx) => [pos, idx]));

  const results: string[][] = [];
  const numCombinations = 1 << positions.length; // 2^n

  for (let mask = 0; mask < numCombinations; mask++) {
    const result: string[] = [];
    let i = 0;
    while (i < tokens.length) {
      const posIndex = positionMap.get(i);
      if (posIndex !== undefined && (mask & (1 << posIndex))) {
        result.push(...from);
        i += toLength;
      } else {
        result.push(tokens[i]);
        i++;
      }
    }
    results.push(result);
  }

  return results;
}

/**
 * Checks if a position in a token array matches the given context
 */
function matchesContextTokens(
  tokens: string[],
  position: number,
  leftContext: string[] | undefined,
  rightContext: string[] | undefined
): boolean {
  if (leftContext !== undefined) {
    if (leftContext.length === 1 && leftContext[0] === '#') {
      if (position !== 0) return false;
    } else {
      const contextLength = leftContext.length;
      if (position >= contextLength) {
        for (let j = 0; j < contextLength; j++) {
          if (tokens[position - contextLength + j] !== leftContext[j]) return false;
        }
      } else {
        return false;
      }
    }
  }

  if (rightContext !== undefined) {
    if (rightContext.length === 1 && rightContext[0] === '#') {
      if (position !== tokens.length - 1) return false;
    } else {
      const contextLength = rightContext.length;
      if (position + 1 + contextLength <= tokens.length) {
        for (let j = 0; j < contextLength; j++) {
          if (tokens[position + 1 + j] !== rightContext[j]) return false;
        }
      } else {
        return false;
      }
    }
  }

  return true;
}

/**
 * Checks if a sequence position in a token array matches the given context
 */
function matchesContextForSequence(
  tokens: string[],
  position: number,
  sequenceLength: number,
  leftContext: string[] | undefined,
  rightContext: string[] | undefined
): boolean {
  if (leftContext !== undefined) {
    if (leftContext.length === 1 && leftContext[0] === '#') {
      if (position !== 0) return false;
    } else {
      const contextLength = leftContext.length;
      if (position >= contextLength) {
        for (let j = 0; j < contextLength; j++) {
          if (tokens[position - contextLength + j] !== leftContext[j]) return false;
        }
      } else {
        return false;
      }
    }
  }

  if (rightContext !== undefined) {
    if (rightContext.length === 1 && rightContext[0] === '#') {
      if (position + sequenceLength !== tokens.length) return false;
    } else {
      const contextLength = rightContext.length;
      if (position + sequenceLength + contextLength <= tokens.length) {
        for (let j = 0; j < contextLength; j++) {
          if (tokens[position + sequenceLength + j] !== rightContext[j]) return false;
        }
      } else {
        return false;
      }
    }
  }

  return true;
}

// Suppress unused-variable warning for matchesContextTokens (kept for API surface)
void matchesContextTokens;
