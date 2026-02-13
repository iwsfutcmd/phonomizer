import type { PhonotacticPattern } from '../types';

/**
 * Checks if a tokenized word matches any of the given phonotactic patterns.
 *
 * @param tokens - The word as an array of phoneme tokens
 * @param phonotactics - Array of valid patterns, or null (unconstrained)
 * @returns true if the word matches at least one pattern, or if phonotactics is null
 */
export function matchesPhonotactics(
  tokens: string[],
  phonotactics: PhonotacticPattern[] | null
): boolean {
  if (phonotactics === null) return true;

  return phonotactics.some(pattern => matchesPattern(tokens, pattern));
}

function matchesPattern(tokens: string[], pattern: PhonotacticPattern): boolean {
  if (tokens.length !== pattern.positions.length) return false;

  for (let i = 0; i < tokens.length; i++) {
    if (!pattern.positions[i].includes(tokens[i])) {
      return false;
    }
  }

  return true;
}
