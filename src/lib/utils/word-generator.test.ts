import { describe, it, expect } from 'vitest';
import { generateAllWords } from './word-generator';
import type { PhonotacticPattern } from '../types';

describe('generateAllWords', () => {
  it('returns empty array for null phonotactics', () => {
    expect(generateAllWords(null)).toEqual([]);
  });

  it('returns empty array for empty pattern array', () => {
    expect(generateAllWords([])).toEqual([]);
  });

  it('generates CV words from simple pattern', () => {
    const phonotactics: PhonotacticPattern[] = [
      { positions: [['p', 't'], ['a', 'e']] }
    ];
    expect(generateAllWords(phonotactics)).toEqual(['pa', 'pe', 'ta', 'te']);
  });

  it('generates CVC words', () => {
    const phonotactics: PhonotacticPattern[] = [
      { positions: [['p', 't'], ['a', 'e'], ['p', 't']] }
    ];
    const words = generateAllWords(phonotactics);
    expect(words).toHaveLength(8);
    expect(words).toContain('pap');
    expect(words).toContain('tet');
    expect(words).toContain('tap');
  });

  it('unions multiple patterns', () => {
    const phonotactics: PhonotacticPattern[] = [
      { positions: [['p'], ['a']] },   // CV: just 'pa'
      { positions: [['t'], ['a']] },   // CV: just 'ta'
    ];
    expect(generateAllWords(phonotactics)).toEqual(['pa', 'ta']);
  });

  it('deduplicates words that appear in multiple patterns', () => {
    const phonotactics: PhonotacticPattern[] = [
      { positions: [['p', 't'], ['a']] },  // pa, ta
      { positions: [['p'], ['a', 'e']] },  // pa, pe — 'pa' duplicated
    ];
    const words = generateAllWords(phonotactics);
    expect(words).toEqual(['pa', 'pe', 'ta']);
    expect(words.filter(w => w === 'pa')).toHaveLength(1);
  });

  it('returns sorted results', () => {
    const phonotactics: PhonotacticPattern[] = [
      { positions: [['z', 'a', 'm'], ['i', 'a']] }
    ];
    const words = generateAllWords(phonotactics);
    const sorted = [...words].sort();
    expect(words).toEqual(sorted);
  });

  it('handles single-position pattern', () => {
    const phonotactics: PhonotacticPattern[] = [
      { positions: [['a', 'e', 'i']] }
    ];
    expect(generateAllWords(phonotactics)).toEqual(['a', 'e', 'i']);
  });

  it('handles multi-character phonemes', () => {
    const phonotactics: PhonotacticPattern[] = [
      { positions: [['th', 'sh'], ['a']] }
    ];
    expect(generateAllWords(phonotactics)).toEqual(['sha', 'tha']);
  });

  it('handles empty positions array in pattern (returns empty string)', () => {
    const phonotactics: PhonotacticPattern[] = [
      { positions: [] }
    ];
    expect(generateAllWords(phonotactics)).toEqual(['']);
  });
});
