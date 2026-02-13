import { describe, it, expect } from 'vitest';
import { reverseRules } from './reverser';
import { parseRules } from './parser';
import type { Rule } from '../types';

describe('reverseRules (backward)', () => {
  it('should reverse a single rule', () => {
    const rules: Rule[] = [{ from: ['a'], to: ['x'] }];
    const result = reverseRules('xbc', rules, ['a', 'b', 'c'], ['x', 'b', 'c']);
    expect(result).toEqual(['abc']);
  });

  it('should generate multiple possibilities when target can stay as-is', () => {
    // If 'x' is in source phonemes, it could have been left as-is
    const rules: Rule[] = [{ from: ['a'], to: ['x'] }];
    const result = reverseRules('x', rules, ['a', 'x'], ['x']);
    expect(result.sort()).toEqual(['a', 'x'].sort());
  });

  it('should handle the main example: a>x, b>y, c>x', () => {
    const rules: Rule[] = [
      { from: ['a'], to: ['x'] },
      { from: ['b'], to: ['y'] },
      { from: ['c'], to: ['x'] }
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
      { from: ['a'], to: ['x'] },
      { from: ['c'], to: ['x'] }
    ];
    // Since 'x' is NOT in source phonemes, all x's must be reversed
    const result = reverseRules('xx', rules, ['a', 'b', 'c'], ['x']);

    // Each x must come from either a or c
    // So: aa, ac, ca, cc
    expect(result.sort()).toEqual(['aa', 'ac', 'ca', 'cc'].sort());
  });

  it('should handle multi-character phonemes', () => {
    const rules: Rule[] = [{ from: ['th'], to: ['θ'] }];
    const result = reverseRules('θink', rules, ['th', 'i', 'n', 'k'], ['θ', 'i', 'n', 'k']);
    expect(result).toEqual(['think']);
  });

  it('should apply rules in reverse order', () => {
    const rules: Rule[] = [
      { from: ['a'], to: ['b'] },
      { from: ['b'], to: ['c'] }
    ];
    // Forward: a -> b -> c
    // Backward from 'c': must have been 'b', then must have been 'a'
    const result = reverseRules('c', rules, ['a'], ['c']);
    expect(result).toEqual(['a']);
  });

  it('should handle deletion reversal (insertion)', () => {
    const rules: Rule[] = [{ from: ['h'], to: [] }];
    // 'ello' could have been 'hello' (h inserted at start)
    // But where can h go? It needs to check all positions
    const result = reverseRules('ello', rules, ['h', 'e', 'l', 'o'], ['e', 'l', 'o']);

    // The reversal of deletion is tricky - the empty string matches everywhere!
    // This might need special handling
    expect(result.length).toBeGreaterThan(0);
  });

  it('should throw error if target word uses invalid phonemes', () => {
    const rules: Rule[] = [{ from: ['a'], to: ['x'] }];
    expect(() => {
      reverseRules('xyz', rules, ['a'], ['x']);
    }).toThrow('Cannot tokenize');
  });

  it('should filter out invalid source results', () => {
    const rules: Rule[] = [{ from: ['a'], to: ['x'] }];
    const result = reverseRules('x', rules, ['a', 'b', 'c'], ['x']);

    // Only 'a' should be in results (x reversed to a)
    // x cannot stay as x because x is not in source phonemes
    expect(result).toEqual(['a']);
  });

  it('should reverse context-sensitive rule (word-initial)', () => {
    const rules: Rule[] = [{ from: ['w'], to: ['j'], leftContext: ['#'] }];
    const result = reverseRules('jaw', rules, ['w', 'a'], ['j', 'a', 'w']);

    // 'j' at start could have been 'w' (from rule) or stay 'j' (if j is in source)
    // Since 'j' is not in source, it must have been 'w'
    expect(result).toEqual(['waw']);
  });

  it('should reverse context-sensitive rule (word-final)', () => {
    const rules: Rule[] = [{ from: ['t'], to: ['d'], rightContext: ['#'] }];
    const result = reverseRules('tad', rules, ['t', 'a'], ['d', 'a', 't']);

    // Final 'd' could have been 't' (from rule)
    // Middle 't' was not transformed (no context match)
    expect(result).toEqual(['tat']);
  });

  it('should reverse context-sensitive rule with multiple possibilities', () => {
    const rules: Rule[] = [{ from: ['w'], to: ['j'], leftContext: ['#'] }];
    // If 'j' is in source phonemes, initial 'j' could be from 'w' OR original 'j'
    const result = reverseRules('jaw', rules, ['w', 'a', 'j'], ['j', 'a', 'w']);

    expect(result.sort()).toEqual(['jaw', 'waw'].sort());
  });

  it('should not reverse rule when context does not match', () => {
    const rules: Rule[] = [{ from: ['w'], to: ['j'], leftContext: ['#'] }];
    // Middle 'j' is not at word boundary, so cannot be from this rule
    const result = reverseRules('aja', rules, ['w', 'a', 'j'], ['j', 'a']);

    // Middle 'j' stays as 'j' (not transformed by this context-sensitive rule)
    expect(result).toEqual(['aja']);
  });

  describe('phoneme class integration', () => {
    it('should reverse class expansion: [a b] > c;', () => {
      const rules = parseRules('[a b] > c;');
      // Going backward: 'c' could have been 'a' or 'b'
      const result = reverseRules('c', rules, ['a', 'b'], ['c']);
      expect(result.sort()).toEqual(['a', 'b'].sort());
    });

    it('should reverse paired class mapping: [a b] > [x y];', () => {
      const rules = parseRules('[a b] > [x y];');
      // x must come from a, y must come from b
      const result = reverseRules('xy', rules, ['a', 'b'], ['x', 'y']);
      expect(result).toEqual(['ab']);
    });

    it('should reverse class with context', () => {
      const rules = parseRules('a > b / [c d] _;');
      // 'cb' could have been 'ca' (since a becomes b after c)
      const result = reverseRules('cb', rules, ['a', 'c', 'd'], ['a', 'b', 'c', 'd']);
      expect(result).toEqual(['ca']);
    });

    it('should generate all possibilities from class merger', () => {
      const rules = parseRules('[a b c] > x;');
      // 'xx' could have been any combination of a, b, c
      const result = reverseRules('xx', rules, ['a', 'b', 'c'], ['x']);
      // 3 * 3 = 9 combinations
      expect(result.length).toBe(9);
      expect(result.sort()).toEqual(['aa', 'ab', 'ac', 'ba', 'bb', 'bc', 'ca', 'cb', 'cc'].sort());
    });

    it('should handle multi-character phonemes in classes', () => {
      const rules = parseRules('[th sh] > [θ ʃ];');
      const result = reverseRules('θinkʃarp', rules, ['th', 'sh', 'i', 'n', 'k', 'a', 'r', 'p'], ['θ', 'ʃ', 'i', 'n', 'k', 'a', 'r', 'p']);
      expect(result).toEqual(['thinksharp']);
    });
  });

  describe('deletion rules', () => {
    it('should reverse unconditional deletion by inserting at all positions', () => {
      // Rule: h > ; (h is deleted)
      // Reversing "ello" (tokens: ['e', 'l', 'l', 'o'])
      // Can insert 'h' at positions: 0(hello), 1(ehllo), 2(elhlo), 3(ellho), 4(elloh)
      const rules: Rule[] = [{ from: ['h'], to: [] }];
      const result = reverseRules('ello', rules, ['h', 'e', 'l', 'o'], ['e', 'l', 'o']);

      // Should have 5 insertion possibilities + original (since h is in source phonemes)
      expect(result.sort()).toEqual(['ehllo', 'elhlo', 'ello', 'ellho', 'elloh', 'hello'].sort());
    });

    it('should reverse deletion with context', () => {
      // Rule: h > ; / _ #  (h is deleted at word end)
      // Reversing "ello" could give: elloh or ello (only at end)
      const rules: Rule[] = [{ from: ['h'], to: [], rightContext: ['#'] }];
      const result = reverseRules('ello', rules, ['h', 'e', 'l', 'o'], ['e', 'l', 'o']);

      // Should only insert at the end (where context matches)
      // Plus the original
      expect(result.sort()).toEqual(['ello', 'elloh'].sort());
    });

    it('should reverse multi-phoneme deletion', () => {
      // Rule: a j > ; (aj sequence is deleted)
      // Reversing "bc" could give: bc, ajbc, bajc, bcaj
      const rules: Rule[] = [{ from: ['a', 'j'], to: [] }];
      const result = reverseRules('bc', rules, ['a', 'j', 'b', 'c'], ['b', 'c']);

      // Can insert 'aj' at positions: 0 (ajbc), 1 (bajc), 2 (bcaj)
      // Plus original (bc)
      expect(result.sort()).toEqual(['ajbc', 'bajc', 'bc', 'bcaj'].sort());
    });

    it('should work even if deleted phoneme not in source set', () => {
      // Rule: h > ; (h is deleted)
      // Even though h is NOT in the provided source phoneme set,
      // the reverser should infer that h is a valid source phoneme (from the rule)
      const rules: Rule[] = [{ from: ['h'], to: [] }];
      const result = reverseRules('ello', rules, ['e', 'l', 'o'], ['e', 'l', 'o']);

      // Should have insertions (h is inferred as valid from the rule)
      // But NOT the original (since the original doesn't use h, and h wasn't in the original set)
      expect(result.sort()).toEqual(['ehllo', 'elhlo', 'ellho', 'elloh', 'hello'].sort());
    });

    it('should handle deletion in a multi-rule sequence', () => {
      // Rules: a > x; h > ;
      // Forward: "aha" -> "xhx" -> "xx"
      // Reverse: "xx" -> could be "xhx", "hxx", "xhx", "xxh", "xx"
      //                -> could be "aha", "haa", ...
      const rules: Rule[] = [
        { from: ['a'], to: ['x'] },
        { from: ['h'], to: [] }
      ];
      const result = reverseRules('xx', rules, ['a', 'h'], ['x']);

      // This is complex - should generate various possibilities
      expect(result.length).toBeGreaterThan(1);
      expect(result).toContain('aha'); // The original
    });
  });
});
