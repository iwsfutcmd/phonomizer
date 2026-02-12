import { parseRules } from '../rules/parser';
import type { Rule } from '../types';

/**
 * Tokenizes a phoneme string into individual phonemes using longest-match-first strategy
 * This should match the tokenization used by the engine/reverser
 */
function tokenizePhonemes(str: string, knownPhonemes: Set<string>): string[] {
  if (!str) return [];

  const result: string[] = [];
  const tokens = str.split(/\s+/).filter(t => t.length > 0);

  for (const token of tokens) {
    // If it's a known multi-character phoneme, use it as-is
    // Otherwise, treat each character as a separate phoneme
    if (knownPhonemes.has(token)) {
      result.push(token);
    } else {
      // For unknown tokens, we'll just add them as-is
      // The engine uses longest-match-first, but without a pre-built inventory
      // we have to treat each space-separated token as a phoneme
      result.push(token);
    }
  }

  return result;
}

/**
 * Extracts phoneme inventories from a ruleset
 *
 * Returns:
 * - source: phonemes that exist in the source language (input)
 * - target: phonemes that exist in the target language (output)
 * - intermediate: phonemes that are produced and consumed by rules (don't appear in final inventories)
 */
export function extractPhonemes(rulesText: string): {
  source: string[];
  target: string[];
  intermediate: string[];
  debug?: {
    allFrom: Set<string>;
    allTo: Set<string>;
    allContext: Set<string>;
  };
} {
  // Parse the rules using the actual parser (handles variables, classes, etc.)
  const rules = parseRules(rulesText);

  // First pass: collect all phonemes to build the known phonemes set
  const allPhonemes = new Set<string>();

  for (const rule of rules) {
    // Add from and to as-is (they're already individual phonemes after expansion)
    if (rule.from) allPhonemes.add(rule.from);
    if (rule.to) allPhonemes.add(rule.to);

    // Add context phonemes
    if (rule.leftContext) {
      const tokens = rule.leftContext.split(/\s+/).filter(t => t.length > 0 && t !== '#');
      tokens.forEach(t => allPhonemes.add(t));
    }
    if (rule.rightContext) {
      const tokens = rule.rightContext.split(/\s+/).filter(t => t.length > 0 && t !== '#');
      tokens.forEach(t => allPhonemes.add(t));
    }
  }

  // Second pass: categorize phonemes and track rule indices
  const appearsInFrom = new Set<string>();
  const appearsInTo = new Set<string>();
  const appearsInContext = new Set<string>();
  const identityPhonemes = new Set<string>(); // Phonemes in identity rules (x > x)

  // Track the last rule index where each phoneme appears
  const lastProducedAt = new Map<string, number>(); // Last rule where phoneme appears in 'to'
  const lastConsumedAt = new Map<string, number>(); // Last UNCONDITIONAL rule where phoneme appears in 'from'

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];

    // Track where each phoneme appears
    if (rule.from) {
      const fromPhonemes = tokenizePhonemes(rule.from, allPhonemes);
      fromPhonemes.forEach(p => {
        appearsInFrom.add(p);

        // Only track as "consumed" if it's an unconditional rule
        // Context-sensitive rules may not apply in all contexts
        if (!rule.leftContext && !rule.rightContext) {
          lastConsumedAt.set(p, i);
        }
      });
    }

    if (rule.to) {
      const toPhonemes = tokenizePhonemes(rule.to, allPhonemes);
      toPhonemes.forEach(p => {
        appearsInTo.add(p);
        lastProducedAt.set(p, i);
      });
    }

    // Check for identity rules (x > x with no context)
    if (rule.from === rule.to && !rule.leftContext && !rule.rightContext) {
      tokenizePhonemes(rule.from, allPhonemes).forEach(p => identityPhonemes.add(p));
    }

    if (rule.leftContext) {
      tokenizePhonemes(rule.leftContext, allPhonemes).forEach(p => {
        if (p !== '#') appearsInContext.add(p);
      });
    }

    if (rule.rightContext) {
      tokenizePhonemes(rule.rightContext, allPhonemes).forEach(p => {
        if (p !== '#') appearsInContext.add(p);
      });
    }
  }

  // Determine source phonemes:
  // Phonemes that appear in `from` or context positions
  const sourcePhonemes = new Set<string>([
    ...appearsInFrom,
    ...appearsInContext
  ]);

  // Determine target phonemes:
  // Phonemes that appear in `to` or context positions
  const targetPhonemes = new Set<string>([
    ...appearsInTo,
    ...appearsInContext
  ]);

  // Determine intermediate phonemes:
  // Phonemes that are produced by some rules AND consumed by later UNCONDITIONAL rules
  // Respects rule ordering and contexts: a phoneme is only intermediate if it's
  // unconditionally consumed AFTER it's last produced
  const intermediate = new Set<string>();

  for (const phoneme of allPhonemes) {
    // Skip if it's in an identity rule or context (stable phonemes)
    if (identityPhonemes.has(phoneme) || appearsInContext.has(phoneme)) {
      continue;
    }

    // A phoneme is intermediate if:
    // - It appears as both target and source
    // - It's consumed by an UNCONDITIONAL rule (lastConsumedAt is set)
    // - The LAST unconditional consumption is AFTER the LAST time it's produced
    if (appearsInTo.has(phoneme) && appearsInFrom.has(phoneme)) {
      const lastProduced = lastProducedAt.get(phoneme) ?? -1;
      const lastConsumed = lastConsumedAt.get(phoneme);

      // Only intermediate if consumed unconditionally after being produced
      // Example: a > b (produced at 0), b > c (consumed unconditionally at 1) → IS intermediate
      // Example: a > b (produced at 0), b > c / _ d (consumed conditionally at 1) → NOT intermediate
      if (lastConsumed !== undefined && lastConsumed > lastProduced) {
        // Remove from both inventories - it's truly intermediate
        sourcePhonemes.delete(phoneme);
        targetPhonemes.delete(phoneme);
        intermediate.add(phoneme);
      }
    }
  }

  // Remove empty string (from deletion rules)
  sourcePhonemes.delete('');
  targetPhonemes.delete('');
  intermediate.delete('');

  return {
    source: Array.from(sourcePhonemes).sort(),
    target: Array.from(targetPhonemes).sort(),
    intermediate: Array.from(intermediate).sort(),
    debug: {
      allFrom: appearsInFrom,
      allTo: appearsInTo,
      allContext: appearsInContext
    }
  };
}

/**
 * Generates phoneme file content from a ruleset
 * Returns space-separated phoneme strings
 */
export function generatePhonemeFiles(rulesText: string): {
  source: string;
  target: string;
  intermediate?: string;
} {
  const { source, target, intermediate } = extractPhonemes(rulesText);

  return {
    source: source.join(' '),
    target: target.join(' '),
    intermediate: intermediate.length > 0 ? intermediate.join(' ') : undefined
  };
}
