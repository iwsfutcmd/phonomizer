import type { Rule } from '../types';

/**
 * Tokenizes a word into phoneme tokens using greedy longest-match
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
      throw new Error(`Cannot tokenize: character(s) at position ${pos} ("${word[pos]}") do not match any phoneme`);
    }
  }

  return tokens;
}

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
  // Tokenize the target word
  let possibilityTokens: Set<string> = new Set([JSON.stringify(tokenize(word, targetPhonemes))]);

  // Apply rules in reverse order
  for (let i = rules.length - 1; i >= 0; i--) {
    const rule = rules[i];
    const newPossibilities: Set<string> = new Set();

    // For each current possibility, find all ways to reverse this rule
    for (const current of possibilityTokens) {
      const tokens = JSON.parse(current) as string[];
      const reversed = reverseOneRule(tokens, rule, sourcePhonemes);
      reversed.forEach(r => newPossibilities.add(JSON.stringify(r)));
    }

    possibilityTokens = newPossibilities;
  }

  // Convert token arrays back to strings and filter to only valid source words
  const validPossibilities = Array.from(possibilityTokens).map(p => {
    const tokens = JSON.parse(p) as string[];
    return tokens.join('');
  }).filter(p => {
    try {
      tokenize(p, sourcePhonemes);
      return true;
    } catch {
      return false;
    }
  });

  return validPossibilities.sort();
}

/**
 * Reverses a single rule application on token arrays
 *
 * Given a token array that has had rule applied to it, find all possible
 * pre-images (token arrays before the rule was applied).
 *
 * For rule "a > x", if we have ["x", "y", "x"], we need to find all positions
 * where "x" appears and consider that each "x" could have been:
 * 1. Transformed from "a" by this rule
 * 2. Was already "x" before this rule (not transformed)
 *
 * For rule "a j > e" (multi-phoneme source), if we have ["e", "y"], we consider
 * that "e" could have been transformed from the sequence ["a", "j"].
 *
 * For rule "a j > a j" (identity with sequence), we need to match the sequence
 * ["a", "j"] in the tokens and consider it could have come from ["a", "j"].
 *
 * We generate ALL combinations and filter invalid ones at the end.
 */
function reverseOneRule(tokens: string[], rule: Rule, sourcePhonemes: string[]): string[][] {
  const { from, to, leftContext, rightContext } = rule;

  const toLength = to.length;

  // Special case: deletion rule (from -> empty)
  // Reversing deletion is insertion, which can happen at any position
  if (to.length === 0) {
    // For now, skip this case - it's complex and needs special handling
    return [tokens];
  }

  // Find all positions where the target sequence appears
  const positions: number[] = [];

  for (let i = 0; i <= tokens.length - toLength; i++) {
    // Check if the target sequence matches at position i
    let sequenceMatches = true;
    for (let j = 0; j < toLength; j++) {
      if (tokens[i + j] !== to[j]) {
        sequenceMatches = false;
        break;
      }
    }

    if (sequenceMatches) {
      // Check if this position matches the context
      if (matchesContextForSequence(tokens, i, toLength, leftContext, rightContext)) {
        positions.push(i);
      }
    }
  }

  // If target doesn't appear in tokens, no reversal needed
  if (positions.length === 0) {
    return [tokens];
  }

  // Generate all possible combinations: each occurrence can be replaced or left as-is
  const results: string[][] = [];
  const numCombinations = Math.pow(2, positions.length);

  for (let mask = 0; mask < numCombinations; mask++) {
    const result: string[] = [];
    let i = 0;

    while (i < tokens.length) {
      const posIndex = positions.indexOf(i);

      if (posIndex !== -1 && (mask & (1 << posIndex))) {
        // Replace this occurrence with the source sequence
        result.push(...from);
        i += toLength; // Skip the target sequence
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
  // Check left context
  if (leftContext !== undefined) {
    if (leftContext.length === 1 && leftContext[0] === '#') {
      // Must be at word beginning
      if (position !== 0) return false;
    } else {
      // Must be preceded by the entire left context sequence
      const contextLength = leftContext.length;
      if (position >= contextLength) {
        for (let j = 0; j < contextLength; j++) {
          if (tokens[position - contextLength + j] !== leftContext[j]) {
            return false;
          }
        }
      } else {
        return false;
      }
    }
  }

  // Check right context
  if (rightContext !== undefined) {
    if (rightContext.length === 1 && rightContext[0] === '#') {
      // Must be at word end
      if (position !== tokens.length - 1) return false;
    } else {
      // Must be followed by the entire right context sequence
      const contextLength = rightContext.length;
      if (position + 1 + contextLength <= tokens.length) {
        for (let j = 0; j < contextLength; j++) {
          if (tokens[position + 1 + j] !== rightContext[j]) {
            return false;
          }
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
  // Check left context (relative to the start of the sequence)
  if (leftContext !== undefined) {
    if (leftContext.length === 1 && leftContext[0] === '#') {
      // Must be at word beginning
      if (position !== 0) return false;
    } else {
      // Must be preceded by the entire left context sequence
      const contextLength = leftContext.length;
      if (position >= contextLength) {
        for (let j = 0; j < contextLength; j++) {
          if (tokens[position - contextLength + j] !== leftContext[j]) {
            return false;
          }
        }
      } else {
        return false;
      }
    }
  }

  // Check right context (relative to the end of the sequence)
  if (rightContext !== undefined) {
    if (rightContext.length === 1 && rightContext[0] === '#') {
      // Must be at word end
      if (position + sequenceLength !== tokens.length) return false;
    } else {
      // Must be followed by the entire right context sequence
      const contextLength = rightContext.length;
      if (position + sequenceLength + contextLength <= tokens.length) {
        for (let j = 0; j < contextLength; j++) {
          if (tokens[position + sequenceLength + j] !== rightContext[j]) {
            return false;
          }
        }
      } else {
        return false;
      }
    }
  }

  return true;
}
