import { describe, it, expect } from 'vitest';
import { reverseRules } from './reverser';
import type { Rule } from '../types';

describe('reverseRules (backward)', () => {
  it('should reverse a single rule', () => {
    const rules: Rule[] = [{ from: 'a', to: 'x' }];
    const result = reverseRules('xbc', rules, ['a', 'b', 'c'], ['x', 'b', 'c']);
    expect(result).toEqual(['abc']);
  });

  it('should generate multiple possibilities when target can stay as-is', () => {
    // If 'x' is in source phonemes, it could have been left as-is
    const rules: Rule[] = [{ from: 'a', to: 'x' }];
    const result = reverseRules('x', rules, ['a', 'x'], ['x']);
    expect(result.sort()).toEqual(['a', 'x'].sort());
  });

  it('should handle the main example: a>x, b>y, c>x', () => {
    const rules: Rule[] = [
      { from: 'a', to: 'x' },
      { from: 'b', to: 'y' },
      { from: 'c', to: 'x' }
    ];
    const result = reverseRules('xyx', rules, ['a', 'b', 'c'], ['x', 'y']);

    // x could come from a or c (not x, since x is not in source)
    // y could come from b (not y, since y is not in source)
    // x could come from a or c
    // So: a-b-a, a-b-c, c-b-a, c-b-c = aba, abc, cba, cbc
    expect(result.sort()).toEqual(['aba', 'abc', 'cba', 'cbc'].sort());
  });

  it('should constrain by source phoneme set', () => {
    const rules: Rule[] = [
      { from: 'a', to: 'x' },
      { from: 'c', to: 'x' }
    ];
    // Since 'x' is NOT in source phonemes, all x's must be reversed
    const result = reverseRules('xx', rules, ['a', 'b', 'c'], ['x']);

    // Each x must come from either a or c
    // So: aa, ac, ca, cc
    expect(result.sort()).toEqual(['aa', 'ac', 'ca', 'cc'].sort());
  });

  it('should handle multi-character phonemes', () => {
    const rules: Rule[] = [{ from: 'th', to: 'θ' }];
    const result = reverseRules('θink', rules, ['th', 'i', 'n', 'k'], ['θ', 'i', 'n', 'k']);
    expect(result).toEqual(['think']);
  });

  it('should apply rules in reverse order', () => {
    const rules: Rule[] = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' }
    ];
    // Forward: a -> b -> c
    // Backward from 'c': must have been 'b', then must have been 'a'
    const result = reverseRules('c', rules, ['a'], ['c']);
    expect(result).toEqual(['a']);
  });

  it('should handle deletion reversal (insertion)', () => {
    const rules: Rule[] = [{ from: 'h', to: '' }];
    // 'ello' could have been 'hello' (h inserted at start)
    // But where can h go? It needs to check all positions
    const result = reverseRules('ello', rules, ['h', 'e', 'l', 'o'], ['e', 'l', 'o']);

    // The reversal of deletion is tricky - the empty string matches everywhere!
    // This might need special handling
    expect(result.length).toBeGreaterThan(0);
  });

  it('should throw error if target word uses invalid phonemes', () => {
    const rules: Rule[] = [{ from: 'a', to: 'x' }];
    expect(() => {
      reverseRules('xyz', rules, ['a'], ['x']);
    }).toThrow('Cannot tokenize');
  });

  it('should filter out invalid source results', () => {
    const rules: Rule[] = [{ from: 'a', to: 'x' }];
    const result = reverseRules('x', rules, ['a', 'b', 'c'], ['x']);

    // Only 'a' should be in results (x reversed to a)
    // x cannot stay as x because x is not in source phonemes
    expect(result).toEqual(['a']);
  });

  it('should reverse context-sensitive rule (word-initial)', () => {
    const rules: Rule[] = [{ from: 'w', to: 'j', leftContext: '#' }];
    const result = reverseRules('jaw', rules, ['w', 'a'], ['j', 'a', 'w']);

    // 'j' at start could have been 'w' (from rule) or stay 'j' (if j is in source)
    // Since 'j' is not in source, it must have been 'w'
    expect(result).toEqual(['waw']);
  });

  it('should reverse context-sensitive rule (word-final)', () => {
    const rules: Rule[] = [{ from: 't', to: 'd', rightContext: '#' }];
    const result = reverseRules('tad', rules, ['t', 'a'], ['d', 'a', 't']);

    // Final 'd' could have been 't' (from rule)
    // Middle 't' was not transformed (no context match)
    expect(result).toEqual(['tat']);
  });

  it('should reverse context-sensitive rule with multiple possibilities', () => {
    const rules: Rule[] = [{ from: 'w', to: 'j', leftContext: '#' }];
    // If 'j' is in source phonemes, initial 'j' could be from 'w' OR original 'j'
    const result = reverseRules('jaw', rules, ['w', 'a', 'j'], ['j', 'a', 'w']);

    expect(result.sort()).toEqual(['jaw', 'waw'].sort());
  });

  it('should not reverse rule when context does not match', () => {
    const rules: Rule[] = [{ from: 'w', to: 'j', leftContext: '#' }];
    // Middle 'j' is not at word boundary, so cannot be from this rule
    const result = reverseRules('aja', rules, ['w', 'a', 'j'], ['j', 'a']);

    // Middle 'j' stays as 'j' (not transformed by this context-sensitive rule)
    expect(result).toEqual(['aja']);
  });
});
