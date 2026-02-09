import type { Rule } from '../types';

/**
 * Applies phonological rules in reverse to find all possible source words
 * that could have produced the given target word.
 *
 * With phoneme sets, we can constrain the search space:
 * - Only consider reversals that result in valid source phonemes
 * - A target phoneme can only be "left as-is" if it exists in the source phoneme set
 *
 * @param word - The target word to reverse
 * @param rules - Array of rules that were applied
 * @param sourcePhonemes - Valid phonemes in the source language
 * @param targetPhonemes - Valid phonemes in the target language
 * @returns Array of all possible source words
 */
export function reverseRules(
  word: string,
  rules: Rule[],
  sourcePhonemes: string[],
  targetPhonemes: string[]
): string[] {
  // Validate that target word only uses target phonemes
  validateWord(word, targetPhonemes, 'target');

  // Start with the target word
  let possibilities: Set<string> = new Set([word]);

  // Apply rules in reverse order
  for (let i = rules.length - 1; i >= 0; i--) {
    const rule = rules[i];
    const newPossibilities: Set<string> = new Set();

    // For each current possibility, find all ways to reverse this rule
    for (const current of possibilities) {
      const reversed = reverseOneRule(current, rule, sourcePhonemes);
      reversed.forEach(r => newPossibilities.add(r));
    }

    possibilities = newPossibilities;
  }

  // Filter to only valid source words
  const validPossibilities = Array.from(possibilities).filter(p => {
    try {
      validateWord(p, sourcePhonemes, 'source');
      return true;
    } catch {
      return false;
    }
  });

  return validPossibilities.sort();
}

/**
 * Reverses a single rule application
 *
 * Given a word that has had rule applied to it, find all possible
 * pre-images (words before the rule was applied).
 *
 * For rule "a > x", if we have "xyx", we need to find all positions
 * where "x" appears and consider that each "x" could have been:
 * 1. Transformed from "a" by this rule
 * 2. Was already "x" before this rule (not transformed)
 *
 * We generate ALL combinations and filter invalid ones at the end.
 */
function reverseOneRule(word: string, rule: Rule, sourcePhonemes: string[]): string[] {
  const { from, to, leftContext, rightContext } = rule;

  // Special case: deletion rule (from -> empty)
  // Reversing deletion is insertion, which can happen at any position
  if (to === '') {
    // For now, skip this case - it's complex and needs special handling
    return [word];
  }

  // Find all positions where the target pattern appears
  const positions: number[] = [];
  let index = 0;

  while (index < word.length) {
    const foundIndex = word.indexOf(to, index);
    if (foundIndex === -1) break;

    // Check if this position matches the context
    if (matchesContext(word, foundIndex, to.length, leftContext, rightContext)) {
      positions.push(foundIndex);
    }

    index = foundIndex + to.length;
  }

  // If target doesn't appear in word, no reversal needed
  if (positions.length === 0) {
    return [word];
  }

  // Generate all possible combinations: each occurrence can be replaced or left as-is
  const results: string[] = [];
  const numCombinations = Math.pow(2, positions.length);

  for (let mask = 0; mask < numCombinations; mask++) {
    let result = word;
    let offset = 0;

    for (let i = 0; i < positions.length; i++) {
      if (mask & (1 << i)) {
        // Replace this occurrence with the source
        const pos = positions[i] + offset;
        result = result.substring(0, pos) + from + result.substring(pos + to.length);
        offset += from.length - to.length;
      }
    }

    results.push(result);
  }

  return results;
}

/**
 * Checks if a position in a word matches the given context
 */
function matchesContext(
  word: string,
  position: number,
  length: number,
  leftContext: string | undefined,
  rightContext: string | undefined
): boolean {
  // Check left context
  if (leftContext !== undefined) {
    if (leftContext === '#') {
      // Must be at word beginning
      if (position !== 0) return false;
    } else {
      // Must be preceded by leftContext
      const beforeIndex = position - leftContext.length;
      if (beforeIndex < 0 || word.substring(beforeIndex, position) !== leftContext) {
        return false;
      }
    }
  }

  // Check right context
  if (rightContext !== undefined) {
    if (rightContext === '#') {
      // Must be at word end
      if (position + length !== word.length) return false;
    } else {
      // Must be followed by rightContext
      const afterIndex = position + length;
      if (word.substring(afterIndex, afterIndex + rightContext.length) !== rightContext) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Validates that a word only uses phonemes from the given set
 * Uses greedy longest-match algorithm
 */
function validateWord(word: string, phonemes: string[], stage: 'source' | 'target'): void {
  if (word === '') return;

  // Sort phonemes by length (longest first) for greedy matching
  const sortedPhonemes = [...phonemes].sort((a, b) => b.length - a.length);

  let pos = 0;
  while (pos < word.length) {
    let matched = false;

    for (const phoneme of sortedPhonemes) {
      if (word.substring(pos, pos + phoneme.length) === phoneme) {
        pos += phoneme.length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      throw new Error(`Invalid ${stage} word: character(s) at position ${pos} ("${word[pos]}") do not match any phoneme in the ${stage} phoneme set`);
    }
  }
}
