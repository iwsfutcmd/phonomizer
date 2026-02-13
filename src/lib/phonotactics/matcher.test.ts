import { describe, it, expect } from 'vitest';
import { matchesPhonotactics } from './matcher';
import type { PhonotacticPattern } from '../types';

describe('matchesPhonotactics', () => {
  it('should return true when phonotactics is null (unconstrained)', () => {
    expect(matchesPhonotactics(['a', 'b', 'c'], null)).toBe(true);
  });

  it('should return true when word matches a simple pattern', () => {
    const patterns: PhonotacticPattern[] = [
      { positions: [['p', 't'], ['a', 'i']] } // CV
    ];
    expect(matchesPhonotactics(['p', 'a'], patterns)).toBe(true);
    expect(matchesPhonotactics(['t', 'i'], patterns)).toBe(true);
  });

  it('should return false when word does not match any pattern', () => {
    const patterns: PhonotacticPattern[] = [
      { positions: [['p', 't'], ['a', 'i']] } // CV
    ];
    expect(matchesPhonotactics(['a', 'p'], patterns)).toBe(false); // VC not allowed
  });

  it('should return false when word length does not match pattern', () => {
    const patterns: PhonotacticPattern[] = [
      { positions: [['p', 't'], ['a', 'i']] } // CV (2 positions)
    ];
    expect(matchesPhonotactics(['p', 'a', 't'], patterns)).toBe(false); // 3 tokens
    expect(matchesPhonotactics(['p'], patterns)).toBe(false); // 1 token
  });

  it('should match against multiple patterns (OR logic)', () => {
    const patterns: PhonotacticPattern[] = [
      { positions: [['a', 'i']] }, // V
      { positions: [['p', 't'], ['a', 'i']] }, // CV
      { positions: [['p', 't'], ['a', 'i'], ['p', 't']] }, // CVC
    ];
    expect(matchesPhonotactics(['a'], patterns)).toBe(true); // V
    expect(matchesPhonotactics(['p', 'a'], patterns)).toBe(true); // CV
    expect(matchesPhonotactics(['t', 'i', 'p'], patterns)).toBe(true); // CVC
    expect(matchesPhonotactics(['p', 'a', 't', 'a'], patterns)).toBe(false); // CVCV not in patterns
  });

  it('should handle empty tokens', () => {
    const patterns: PhonotacticPattern[] = [
      { positions: [['a']] }
    ];
    expect(matchesPhonotactics([], patterns)).toBe(false);
  });

  it('should handle empty patterns array', () => {
    expect(matchesPhonotactics(['a'], [])).toBe(false);
  });

  it('should handle multi-character phonemes', () => {
    const patterns: PhonotacticPattern[] = [
      { positions: [['th', 'sh'], ['a', 'i']] }
    ];
    expect(matchesPhonotactics(['th', 'a'], patterns)).toBe(true);
    expect(matchesPhonotactics(['sh', 'i'], patterns)).toBe(true);
    expect(matchesPhonotactics(['t', 'h', 'a'], patterns)).toBe(false); // wrong tokenization
  });
});
