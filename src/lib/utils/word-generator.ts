import type { PhonotacticPattern } from '../types';

/**
 * Generates all words matching any of the given phonotactic patterns.
 * Returns a sorted, deduplicated array of words.
 * Returns [] if phonotactics is null or empty.
 */
export function generateAllWords(phonotactics: PhonotacticPattern[] | null): string[] {
  if (!phonotactics || phonotactics.length === 0) return [];

  const results = new Set<string>();
  for (const pattern of phonotactics) {
    for (const combo of cartesianProduct(pattern.positions)) {
      results.add(combo.join(''));
    }
  }
  return Array.from(results).sort();
}

function cartesianProduct(arrays: string[][]): string[][] {
  if (arrays.length === 0) return [[]];
  return arrays.reduce<string[][]>(
    (acc, arr) => acc.flatMap(combo => arr.map(item => [...combo, item])),
    [[]]
  );
}
