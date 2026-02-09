import type { Rule } from '../types';

/**
 * Applies phonological rules to a word in forward direction
 *
 * Rules are applied sequentially. Each rule transforms the entire word
 * before the next rule is applied.
 *
 * @param word - The source word to transform
 * @param rules - Array of rules to apply in order
 * @param sourcePhonemes - Valid phonemes in the source language
 * @param targetPhonemes - Valid phonemes in the target language
 * @returns The transformed target word
 */
export function applyRules(
  word: string,
  rules: Rule[],
  sourcePhonemes: string[],
  targetPhonemes: string[]
): string {
  // Validate that word only uses source phonemes
  validateWord(word, sourcePhonemes, 'source');

  // Validate that rules use valid phonemes
  for (const rule of rules) {
    if (!sourcePhonemes.includes(rule.from)) {
      throw new Error(`Rule "${rule.from} > ${rule.to}": source phoneme "${rule.from}" is not in source phoneme set`);
    }
    if (rule.to !== '' && !targetPhonemes.includes(rule.to)) {
      throw new Error(`Rule "${rule.from} > ${rule.to}": target phoneme "${rule.to}" is not in target phoneme set`);
    }
  }

  let result = word;

  for (const rule of rules) {
    result = applyRule(result, rule);
  }

  return result;
}

/**
 * Applies a single rule to a word, respecting context if present
 */
function applyRule(word: string, rule: Rule): string {
  const { from, to, leftContext, rightContext } = rule;

  // If no context, use simple replacement
  if (!leftContext && !rightContext) {
    return word.replaceAll(from, to);
  }

  // Context-sensitive replacement
  let result = word;
  let searchPos = 0;

  while (searchPos < result.length) {
    const foundIndex = result.indexOf(from, searchPos);
    if (foundIndex === -1) break;

    // Check left context
    let leftMatch = true;
    if (leftContext !== undefined) {
      if (leftContext === '#') {
        // Must be at word beginning
        leftMatch = foundIndex === 0;
      } else {
        // Must be preceded by leftContext
        const beforeIndex = foundIndex - leftContext.length;
        leftMatch = beforeIndex >= 0 && result.substring(beforeIndex, foundIndex) === leftContext;
      }
    }

    // Check right context
    let rightMatch = true;
    if (rightContext !== undefined) {
      if (rightContext === '#') {
        // Must be at word end
        rightMatch = foundIndex + from.length === result.length;
      } else {
        // Must be followed by rightContext
        const afterIndex = foundIndex + from.length;
        rightMatch = result.substring(afterIndex, afterIndex + rightContext.length) === rightContext;
      }
    }

    // Apply replacement if context matches
    if (leftMatch && rightMatch) {
      result = result.substring(0, foundIndex) + to + result.substring(foundIndex + from.length);
      searchPos = foundIndex + to.length;
    } else {
      searchPos = foundIndex + from.length;
    }
  }

  return result;
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

    // Try to match the longest phoneme first
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
