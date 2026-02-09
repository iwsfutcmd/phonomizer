import { describe, it, expect } from 'vitest';
import { applyRules } from './engine';
import type { Rule } from '../types';

describe('applyRules (forward)', () => {
  it('should apply a single rule', () => {
    const rules: Rule[] = [{ from: 'a', to: 'x' }];
    const result = applyRules('abc', rules, ['a', 'b', 'c'], ['x', 'b', 'c']);
    expect(result).toBe('xbc');
  });

  it('should apply multiple rules sequentially', () => {
    const rules: Rule[] = [
      { from: 'a', to: 'x' },
      { from: 'b', to: 'y' },
      { from: 'c', to: 'x' }
    ];
    const result = applyRules('abc', rules, ['a', 'b', 'c'], ['x', 'y']);
    expect(result).toBe('xyx');
  });

  it('should apply rules in order (order matters)', () => {
    const rules: Rule[] = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' }
    ];
    const result = applyRules('a', rules, ['a', 'b'], ['b', 'c']);
    expect(result).toBe('c'); // a -> b, then b -> c
  });

  it('should handle multi-character phonemes', () => {
    const rules: Rule[] = [{ from: 'th', to: 'θ' }];
    const result = applyRules('think', rules, ['th', 'i', 'n', 'k'], ['θ', 'i', 'n', 'k']);
    expect(result).toBe('θink');
  });

  it('should handle deletion (empty target)', () => {
    const rules: Rule[] = [{ from: 'h', to: '' }];
    const result = applyRules('hello', rules, ['h', 'e', 'l', 'o'], ['e', 'l', 'o']);
    expect(result).toBe('ello');
  });

  it('should throw error if source word uses invalid phonemes', () => {
    const rules: Rule[] = [{ from: 'a', to: 'x' }];
    expect(() => {
      applyRules('abc', rules, ['a', 'b'], ['x']);
    }).toThrow('Invalid source word');
  });

  it('should throw error if rule source not in source phoneme set', () => {
    const rules: Rule[] = [{ from: 'z', to: 'x' }];
    expect(() => {
      applyRules('abc', rules, ['a', 'b', 'c'], ['x']);
    }).toThrow('source phoneme "z" is not in source phoneme set');
  });

  it('should throw error if rule target not in target phoneme set', () => {
    const rules: Rule[] = [{ from: 'a', to: 'z' }];
    expect(() => {
      applyRules('abc', rules, ['a', 'b', 'c'], ['x']);
    }).toThrow('target phoneme "z" is not in target phoneme set');
  });

  it('should apply context-sensitive rule (word-initial)', () => {
    const rules: Rule[] = [{ from: 'w', to: 'j', leftContext: '#' }];
    const result = applyRules('waw', rules, ['w', 'a'], ['j', 'a', 'w']);
    expect(result).toBe('jaw'); // Only initial w becomes j
  });

  it('should apply context-sensitive rule (word-final)', () => {
    const rules: Rule[] = [{ from: 't', to: 'd', rightContext: '#' }];
    const result = applyRules('tat', rules, ['t', 'a'], ['d', 'a', 't']);
    expect(result).toBe('tad'); // Only final t becomes d
  });

  it('should apply context-sensitive rule (between phonemes)', () => {
    const rules: Rule[] = [{ from: 'a', to: 'e', leftContext: 'b', rightContext: 'c' }];
    const result = applyRules('bacbad', rules, ['a', 'b', 'c', 'd'], ['e', 'b', 'c', 'd']);
    expect(result).toBe('becbad'); // Only 'a' between b and c becomes e
  });

  it('should not apply rule when context does not match', () => {
    const rules: Rule[] = [{ from: 'w', to: 'j', leftContext: '#' }];
    const result = applyRules('awa', rules, ['w', 'a'], ['j', 'a', 'w']);
    expect(result).toBe('awa'); // Middle w is not at word boundary
  });
});
