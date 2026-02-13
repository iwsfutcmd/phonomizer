import { describe, it, expect } from 'vitest';
import { applyRules } from './engine';
import { parseRules } from './parser';
import type { Rule } from '../types';

describe('applyRules (forward)', () => {
  it('should apply a single rule', () => {
    const rules: Rule[] = [{ from: ['a'], to: ['x'] }];
    const result = applyRules('abc', rules, ['a', 'b', 'c'], ['x', 'b', 'c']);
    expect(result).toBe('xbc');
  });

  it('should apply multiple rules sequentially', () => {
    const rules: Rule[] = [
      { from: ['a'], to: ['x'] },
      { from: ['b'], to: ['y'] },
      { from: ['c'], to: ['x'] }
    ];
    const result = applyRules('abc', rules, ['a', 'b', 'c'], ['x', 'y']);
    expect(result).toBe('xyx');
  });

  it('should apply rules in order (order matters)', () => {
    const rules: Rule[] = [
      { from: ['a'], to: ['b'] },
      { from: ['b'], to: ['c'] }
    ];
    const result = applyRules('a', rules, ['a', 'b'], ['b', 'c']);
    expect(result).toBe('c'); // a -> b, then b -> c
  });

  it('should handle multi-character phonemes', () => {
    const rules: Rule[] = [{ from: ['th'], to: ['θ'] }];
    const result = applyRules('think', rules, ['th', 'i', 'n', 'k'], ['θ', 'i', 'n', 'k']);
    expect(result).toBe('θink');
  });

  it('should handle deletion (empty target)', () => {
    const rules: Rule[] = [{ from: ['h'], to: [] }];
    const result = applyRules('hello', rules, ['h', 'e', 'l', 'o'], ['e', 'l', 'o']);
    expect(result).toBe('ello');
  });

  it('should throw error if source word uses invalid phonemes', () => {
    const rules: Rule[] = [{ from: ['a'], to: ['x'] }];
    expect(() => {
      applyRules('abc', rules, ['a', 'b'], ['x']);
    }).toThrow('Cannot tokenize');
  });

  // Note: We no longer validate that rules use phonemes from the phoneme sets
  // because rules may use intermediate phonemes (produced by one rule, consumed by another)

  it('should apply context-sensitive rule (word-initial)', () => {
    const rules: Rule[] = [{ from: ['w'], to: ['j'], leftContext: ['#'] }];
    const result = applyRules('waw', rules, ['w', 'a'], ['j', 'a', 'w']);
    expect(result).toBe('jaw'); // Only initial w becomes j
  });

  it('should apply context-sensitive rule (word-final)', () => {
    const rules: Rule[] = [{ from: ['t'], to: ['d'], rightContext: ['#'] }];
    const result = applyRules('tat', rules, ['t', 'a'], ['d', 'a', 't']);
    expect(result).toBe('tad'); // Only final t becomes d
  });

  it('should apply context-sensitive rule (between phonemes)', () => {
    const rules: Rule[] = [{ from: ['a'], to: ['e'], leftContext: ['b'], rightContext: ['c'] }];
    const result = applyRules('bacbad', rules, ['a', 'b', 'c', 'd'], ['e', 'b', 'c', 'd']);
    expect(result).toBe('becbad'); // Only 'a' between b and c becomes e
  });

  it('should not apply rule when context does not match', () => {
    const rules: Rule[] = [{ from: ['w'], to: ['j'], leftContext: ['#'] }];
    const result = applyRules('awa', rules, ['w', 'a'], ['j', 'a', 'w']);
    expect(result).toBe('awa'); // Middle w is not at word boundary
  });

  it('should correctly handle multi-char phonemes that start with same characters', () => {
    // This tests the fix for the issue where "ɬ > ʃ" was incorrectly matching "ɬʼ"
    // before "ɬʼ > dˤ" could be applied. With tokenization, "ɬʼ" is treated as
    // a single token, so the "ɬ > ʃ" rule won't match it.
    const rules: Rule[] = [
      { from: ['ɬ'], to: ['ʃ'] },
      { from: ['ɬʼ'], to: ['dˤ'] }
    ];
    const result = applyRules('ʔrɬʼ', rules, ['ʔ', 'r', 'ɬ', 'ɬʼ'], ['ʔ', 'r', 'ʃ', 'dˤ']);
    expect(result).toBe('ʔrdˤ'); // ɬʼ should become dˤ, not ʃʼ
  });

  it('should handle multi-phoneme source (sequence contraction)', () => {
    // Test rule like "a j > e" (two phonemes become one)
    const rules: Rule[] = [{ from: ['a', 'j'], to: ['e'] }];
    const result = applyRules('baj', rules, ['b', 'a', 'j'], ['b', 'e']);
    expect(result).toBe('be'); // 'a' followed by 'j' becomes 'e'
  });

  it('should handle multi-phoneme source with multiple occurrences', () => {
    const rules: Rule[] = [{ from: ['a', 'j'], to: ['e'] }];
    const result = applyRules('bajkaj', rules, ['b', 'a', 'j', 'k'], ['b', 'e', 'k']);
    expect(result).toBe('beke'); // Both 'aj' sequences become 'e'
  });

  it('should handle multi-phoneme source with context', () => {
    // Test rule like "a j > e / _ #" (aj becomes e at word end)
    const rules: Rule[] = [{ from: ['a', 'j'], to: ['e'], rightContext: ['#'] }];
    const result = applyRules('bajkaj', rules, ['b', 'a', 'j', 'k'], ['b', 'a', 'j', 'e', 'k']);
    expect(result).toBe('bajke'); // Only final 'aj' becomes 'e'
  });

  it('should handle multi-phoneme target (identity)', () => {
    // Test rule like "a j > a j" (sequence stays the same)
    const rules: Rule[] = [{ from: ['a', 'j'], to: ['a', 'j'] }];
    const result = applyRules('baj', rules, ['b', 'a', 'j'], ['b', 'a', 'j']);
    expect(result).toBe('baj'); // No change
  });

  it('should handle multi-phoneme source and target (expansion)', () => {
    // Test rule like "e > a j" (one phoneme becomes two)
    const rules: Rule[] = [{ from: ['e'], to: ['a', 'j'] }];
    const result = applyRules('be', rules, ['b', 'e'], ['b', 'a', 'j']);
    expect(result).toBe('baj'); // 'e' expands to 'aj'
  });

  it('should handle multi-phoneme to multi-phoneme transformation', () => {
    // Test rule like "a j > e i" (two phonemes become two different phonemes)
    const rules: Rule[] = [{ from: ['a', 'j'], to: ['e', 'i'] }];
    const result = applyRules('baj', rules, ['b', 'a', 'j'], ['b', 'e', 'i']);
    expect(result).toBe('bei'); // 'aj' becomes 'ei'
  });

  describe('phoneme class integration', () => {
    it('should apply expanded class rules: [a b] > c;', () => {
      const rules = parseRules('[a b] > c;');
      const result = applyRules('abc', rules, ['a', 'b', 'c'], ['c']);
      expect(result).toBe('ccc'); // Both a and b become c
    });

    it('should apply paired class mapping: [a b] > [x y];', () => {
      const rules = parseRules('[a b] > [x y];');
      const result = applyRules('ab', rules, ['a', 'b'], ['x', 'y']);
      expect(result).toBe('xy'); // a→x, b→y
    });

    it('should apply class with context', () => {
      const rules = parseRules('a > b / [c d] _;');
      const result1 = applyRules('ca', rules, ['a', 'c', 'd'], ['a', 'b', 'c', 'd']);
      const result2 = applyRules('da', rules, ['a', 'c', 'd'], ['a', 'b', 'c', 'd']);
      const result3 = applyRules('ea', rules, ['a', 'e', 'c', 'd'], ['a', 'b', 'e', 'c', 'd']);
      expect(result1).toBe('cb'); // a becomes b after c
      expect(result2).toBe('db'); // a becomes b after d
      expect(result3).toBe('ea'); // a stays a after e (no match)
    });

    it('should handle multiple phonemes in class', () => {
      const rules = parseRules('[a b c] > x;');
      const result = applyRules('abc', rules, ['a', 'b', 'c'], ['x']);
      expect(result).toBe('xxx'); // All merge to x
    });

    it('should apply multi-character phonemes in classes', () => {
      const rules = parseRules('[th sh] > [θ ʃ];');
      const result = applyRules('thinksharp', rules, ['th', 'i', 'n', 'k', 'sh', 'a', 'r', 'p'], ['θ', 'ʃ', 'i', 'n', 'k', 'a', 'r', 'p']);
      expect(result).toBe('θinkʃarp');
    });
  });

  describe('multi-phoneme contexts', () => {
    it('should handle multi-phoneme left context', () => {
      // Test rule: a > b / t h _  (a becomes b after "t h" sequence)
      const rules: Rule[] = [{ from: ['a'], to: ['b'], leftContext: ['t', 'h'] }];
      const result = applyRules('tha', rules, ['t', 'h', 'a'], ['t', 'h', 'b']);
      expect(result).toBe('thb'); // a becomes b after th
    });

    it('should handle multi-phoneme right context', () => {
      // Test rule: a > b / _ t h  (a becomes b before "t h" sequence)
      const rules: Rule[] = [{ from: ['a'], to: ['b'], rightContext: ['t', 'h'] }];
      const result = applyRules('ath', rules, ['a', 't', 'h'], ['b', 't', 'h']);
      expect(result).toBe('bth'); // a becomes b before th
    });

    it('should handle multi-phoneme contexts on both sides', () => {
      // Test rule: a > b / c d _ e f  (a becomes b between "c d" and "e f")
      const rules: Rule[] = [{ from: ['a'], to: ['b'], leftContext: ['c', 'd'], rightContext: ['e', 'f'] }];
      const result = applyRules('cdaef', rules, ['c', 'd', 'a', 'e', 'f'], ['c', 'd', 'b', 'e', 'f']);
      expect(result).toBe('cdbef'); // a becomes b in correct context
    });

    it('should not apply rule when multi-phoneme context does not match', () => {
      // Test rule: a > b / t h _
      const rules: Rule[] = [{ from: ['a'], to: ['b'], leftContext: ['t', 'h'] }];
      const result1 = applyRules('ta', rules, ['t', 'h', 'a'], ['t', 'h', 'b', 'a']);
      const result2 = applyRules('ha', rules, ['t', 'h', 'a'], ['t', 'h', 'b', 'a']);
      expect(result1).toBe('ta'); // Only 't' before a, not 't h'
      expect(result2).toBe('ha'); // Only 'h' before a, not 't h'
    });

    it('should handle word boundary with multi-phoneme sequences', () => {
      // Test rule: t h > θ / # _  (t followed by h becomes θ at word beginning)
      const rules: Rule[] = [{ from: ['t', 'h'], to: ['θ'], leftContext: ['#'] }];
      const result = applyRules('thathin', rules, ['t', 'h', 'a', 'i', 'n'], ['θ', 'a', 't', 'h', 'i', 'n']);
      expect(result).toBe('θathin'); // Only initial t-h becomes θ
    });
  });
});
