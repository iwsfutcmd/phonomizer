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
 * Validates that a rule's source is a valid sequence of phonemes
 */
function validateRuleSource(from: string, phonemes: string[]): string[] {
  // Split by spaces to get potential sequence
  const parts = from.split(/\s+/);

  // Validate each part is a phoneme
  for (const part of parts) {
    if (!phonemes.includes(part)) {
      throw new Error(`source phoneme "${part}" is not in source phoneme set`);
    }
  }

  return parts;
}

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
  // Tokenize the word into phonemes
  let tokens = tokenize(word, sourcePhonemes);

  // Validate that rules use valid phonemes
  for (const rule of rules) {
    // Validate source (can be a sequence like "a j")
    validateRuleSource(rule.from, sourcePhonemes);

    // Validate target
    if (rule.to !== '' && !targetPhonemes.includes(rule.to)) {
      throw new Error(`Rule "${rule.from} > ${rule.to}": target phoneme "${rule.to}" is not in target phoneme set`);
    }
  }

  // Apply each rule to the token sequence
  for (const rule of rules) {
    tokens = applyRuleToTokens(tokens, rule, sourcePhonemes);
  }

  return tokens.join('');
}

/**
 * Applies a single rule to a token array, respecting context if present
 */
function applyRuleToTokens(tokens: string[], rule: Rule, phonemes: string[]): string[] {
  const { from, to, leftContext, rightContext } = rule;

  // Parse source as potentially multi-phoneme sequence
  const fromSequence = from.split(/\s+/);
  const sequenceLength = fromSequence.length;

  const result: string[] = [];
  let i = 0;

  while (i < tokens.length) {
    // Check if we have a sequence match starting at position i
    let sequenceMatches = true;
    if (i + sequenceLength <= tokens.length) {
      for (let j = 0; j < sequenceLength; j++) {
        if (tokens[i + j] !== fromSequence[j]) {
          sequenceMatches = false;
          break;
        }
      }
    } else {
      sequenceMatches = false;
    }

    if (sequenceMatches) {
      // Check left context (context is relative to the first phoneme of the sequence)
      let leftMatch = true;
      if (leftContext !== undefined) {
        if (leftContext === '#') {
          // Must be at word beginning
          leftMatch = i === 0;
        } else {
          // Must be preceded by leftContext
          leftMatch = i > 0 && tokens[i - 1] === leftContext;
        }
      }

      // Check right context (context is relative to the last phoneme of the sequence)
      let rightMatch = true;
      if (rightContext !== undefined) {
        if (rightContext === '#') {
          // Must be at word end
          rightMatch = (i + sequenceLength) === tokens.length;
        } else {
          // Must be followed by rightContext
          rightMatch = (i + sequenceLength) < tokens.length && tokens[i + sequenceLength] === rightContext;
        }
      }

      // Apply replacement if context matches
      if (leftMatch && rightMatch) {
        if (to !== '') {
          result.push(to);
        }
        // If to is empty, we delete the sequence (don't push anything)
        i += sequenceLength; // Skip the entire matched sequence
      } else {
        result.push(tokens[i]);
        i++;
      }
    } else {
      result.push(tokens[i]);
      i++;
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
