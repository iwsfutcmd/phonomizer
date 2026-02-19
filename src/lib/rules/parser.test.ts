import { describe, it, expect } from 'vitest';
import { parseRules } from './parser';

describe('parseRules', () => {
  it('should parse simple rules', () => {
    const rules = parseRules('a > x\nb > y');
    expect(rules).toEqual([
      { from: ['a'], to: ['x'] },
      { from: ['b'], to: ['y'] }
    ]);
  });

  it('should handle whitespace around >', () => {
    const rules = parseRules('a>x\nb  >  y');
    expect(rules).toEqual([
      { from: ['a'], to: ['x'] },
      { from: ['b'], to: ['y'] }
    ]);
  });

  it('should handle empty lines', () => {
    const rules = parseRules('a > x\n\nb > y\n');
    expect(rules).toEqual([
      { from: ['a'], to: ['x'] },
      { from: ['b'], to: ['y'] }
    ]);
  });

  it('should handle comments', () => {
    const rules = parseRules('# This is a comment\na > x\n# Another comment\nb > y');
    expect(rules).toEqual([
      { from: ['a'], to: ['x'] },
      { from: ['b'], to: ['y'] }
    ]);
  });

  it('should allow empty target (deletion)', () => {
    const rules = parseRules('a > ');
    expect(rules).toEqual([{ from: ['a'], to: [] }]);
  });

  it('should allow ∅ as deletion target', () => {
    const rules = parseRules('a > ∅');
    expect(rules).toEqual([{ from: ['a'], to: [] }]);
  });

  it('should allow ∅ deletion with context', () => {
    const rules = parseRules('h > ∅ / _ #');
    expect(rules).toEqual([{ from: ['h'], to: [], leftContext: undefined, rightContext: ['#'] }]);
  });

  it('should handle multi-character phonemes', () => {
    const rules = parseRules('th > x\nsh > y');
    expect(rules).toEqual([
      { from: ['th'], to: ['x'] },
      { from: ['sh'], to: ['y'] }
    ]);
  });

  it('should throw error if > is missing', () => {
    expect(() => parseRules('a x')).toThrow('must have format');
  });

  it('should throw error if source is empty', () => {
    expect(() => parseRules(' > x')).toThrow('cannot be empty');
  });

  it('should parse rule with left context (word boundary)', () => {
    const rules = parseRules('w > j / # _');
    expect(rules).toEqual([
      { from: ['w'], to: ['j'], leftContext: ['#'], rightContext: undefined }
    ]);
  });

  it('should parse rule with right context (word boundary)', () => {
    const rules = parseRules('t > d / _ #');
    expect(rules).toEqual([
      { from: ['t'], to: ['d'], leftContext: undefined, rightContext: ['#'] }
    ]);
  });

  it('should parse rule with both contexts', () => {
    const rules = parseRules('a > e / b _ c');
    expect(rules).toEqual([
      { from: ['a'], to: ['e'], leftContext: ['b'], rightContext: ['c'] }
    ]);
  });

  it('should parse rule with left phoneme context', () => {
    const rules = parseRules('k > g / n _');
    expect(rules).toEqual([
      { from: ['k'], to: ['g'], leftContext: ['n'], rightContext: undefined }
    ]);
  });

  it('should throw error if context missing underscore', () => {
    expect(() => parseRules('a > x / # #')).toThrow('must contain _ to mark phoneme position');
  });

  describe('phoneme classes', () => {
    it('should parse simple class expansion: [a b] > c', () => {
      const rules = parseRules('[a b] > c');
      expect(rules).toEqual([
        { from: ['a'], to: ['c'] },
        { from: ['b'], to: ['c'] }
      ]);
    });

    it('should parse paired classes: [a b] > [x y]', () => {
      const rules = parseRules('[a b] > [x y]');
      expect(rules).toEqual([
        { from: ['a'], to: ['x'] },
        { from: ['b'], to: ['y'] }
      ]);
    });

    it('should parse class with three phonemes', () => {
      const rules = parseRules('[a b c] > [x y z]');
      expect(rules).toEqual([
        { from: ['a'], to: ['x'] },
        { from: ['b'], to: ['y'] },
        { from: ['c'], to: ['z'] }
      ]);
    });

    it('should parse class in left context: a > b / [c d] _', () => {
      const rules = parseRules('a > b / [c d] _');
      expect(rules).toEqual([
        { from: ['a'], to: ['b'], leftContext: ['c'], rightContext: undefined },
        { from: ['a'], to: ['b'], leftContext: ['d'], rightContext: undefined }
      ]);
    });

    it('should parse class in right context: a > b / _ [c d]', () => {
      const rules = parseRules('a > b / _ [c d]');
      expect(rules).toEqual([
        { from: ['a'], to: ['b'], leftContext: undefined, rightContext: ['c'] },
        { from: ['a'], to: ['b'], leftContext: undefined, rightContext: ['d'] }
      ]);
    });

    it('should handle class with multi-character phonemes: [th sh] > [θ ʃ]', () => {
      const rules = parseRules('[th sh] > [θ ʃ]');
      expect(rules).toEqual([
        { from: ['th'], to: ['θ'] },
        { from: ['sh'], to: ['ʃ'] }
      ]);
    });

    it('should expand multiple classes: [a b] > [x y] / [c d] _', () => {
      const rules = parseRules('[a b] > [x y] / [c d] _');
      expect(rules).toEqual([
        { from: ['a'], to: ['x'], leftContext: ['c'], rightContext: undefined },
        { from: ['a'], to: ['x'], leftContext: ['d'], rightContext: undefined },
        { from: ['b'], to: ['y'], leftContext: ['c'], rightContext: undefined },
        { from: ['b'], to: ['y'], leftContext: ['d'], rightContext: undefined }
      ]);
    });

    it('should expand classes in both contexts', () => {
      const rules = parseRules('a > b / [c d] _ [e f]');
      expect(rules).toEqual([
        { from: ['a'], to: ['b'], leftContext: ['c'], rightContext: ['e'] },
        { from: ['a'], to: ['b'], leftContext: ['c'], rightContext: ['f'] },
        { from: ['a'], to: ['b'], leftContext: ['d'], rightContext: ['e'] },
        { from: ['a'], to: ['b'], leftContext: ['d'], rightContext: ['f'] }
      ]);
    });

    it('should expand [a b c] > d; to three rules', () => {
      const rules = parseRules('[a b c] > d');
      expect(rules).toEqual([
        { from: ['a'], to: ['d'] },
        { from: ['b'], to: ['d'] },
        { from: ['c'], to: ['d'] }
      ]);
    });

    it('should handle whitespace inside classes', () => {
      const rules = parseRules('[  a   b  ] > [x y]');
      expect(rules).toEqual([
        { from: ['a'], to: ['x'] },
        { from: ['b'], to: ['y'] }
      ]);
    });

    it('should throw error if target is class but source is not', () => {
      expect(() => parseRules('a > [x y]')).toThrow('Class in target requires class in source');
    });

    it('should throw error if class lengths do not match', () => {
      expect(() => parseRules('[a b] > [x y z]')).toThrow('Class lengths must match');
    });

    it('should throw error if class is empty', () => {
      expect(() => parseRules('[] > x')).toThrow('Class cannot be empty');
    });

    it('should work with deletion: [a b] > ', () => {
      const rules = parseRules('[a b] > ');
      expect(rules).toEqual([
        { from: ['a'], to: [] },
        { from: ['b'], to: [] }
      ]);
    });

    it('should work with ∅ deletion: [a b] > ∅', () => {
      const rules = parseRules('[a b] > ∅');
      expect(rules).toEqual([
        { from: ['a'], to: [] },
        { from: ['b'], to: [] }
      ]);
    });

    it('should handle complex Unicode in classes', () => {
      const rules = parseRules('[ɬ ɬʼ] > [ʃ dˤ]');
      expect(rules).toEqual([
        { from: ['ɬ'], to: ['ʃ'] },
        { from: ['ɬʼ'], to: ['dˤ'] }
      ]);
    });
  });

  describe('variables', () => {
    it('should parse simple variable definition and usage', () => {
      const rules = parseRules('C = [p t k]\nC > x');
      expect(rules).toEqual([
        { from: ['p'], to: ['x'] },
        { from: ['t'], to: ['x'] },
        { from: ['k'], to: ['x'] }
      ]);
    });

    it('should handle single phoneme variables', () => {
      const rules = parseRules('X = a\nX > b');
      expect(rules).toEqual([{ from: ['a'], to: ['b'] }]);
    });

    it('should allow variables in target position with single source', () => {
      // When target is a class and source is not, this should error
      // But if we want this to work, we'd need to change semantics
      // For now, this is an invalid rule according to class syntax
      expect(() => {
        parseRules('V = [a e i]\nx > V');
      }).toThrow('Class in target requires class in source');
    });

    it('should allow variables in context', () => {
      const rules = parseRules('C = [p t]\nV = [a e]\na > b / C _ V');
      expect(rules).toEqual([
        { from: ['a'], to: ['b'], leftContext: ['p'], rightContext: ['a'] },
        { from: ['a'], to: ['b'], leftContext: ['p'], rightContext: ['e'] },
        { from: ['a'], to: ['b'], leftContext: ['t'], rightContext: ['a'] },
        { from: ['a'], to: ['b'], leftContext: ['t'], rightContext: ['e'] }
      ]);
    });

    it('should handle variable references (nested classes)', () => {
      const rules = parseRules(`
        V1 = [a e];
        V2 = [i o];
        V = [V1 V2];
        V > x;
      `);
      expect(rules).toEqual([
        { from: ['a'], to: ['x'] },
        { from: ['e'], to: ['x'] },
        { from: ['i'], to: ['x'] },
        { from: ['o'], to: ['x'] }
      ]);
    });

    it('should handle deeply nested variable references', () => {
      const rules = parseRules(`
        A = [x y];
        B = A;
        C = B;
        C > z;
      `);
      expect(rules).toEqual([
        { from: ['x'], to: ['z'] },
        { from: ['y'], to: ['z'] }
      ]);
    });

    it('should detect circular references', () => {
      expect(() => {
        parseRules('A = B\nB = A\nA > x');
      }).toThrow('Circular reference');
    });

    it('should detect self-referential variables', () => {
      expect(() => {
        parseRules('A = A\nA > x');
      }).toThrow('Circular reference');
    });

    it('should handle multi-character phonemes in variables', () => {
      const rules = parseRules('F = [th sh]\nF > x');
      expect(rules).toEqual([
        { from: ['th'], to: ['x'] },
        { from: ['sh'], to: ['x'] }
      ]);
    });

    it('should allow variables with paired class mapping', () => {
      const rules = parseRules('C = [p t k]\nV = [b d g]\nC > V');
      expect(rules).toEqual([
        { from: ['p'], to: ['b'] },
        { from: ['t'], to: ['d'] },
        { from: ['k'], to: ['g'] }
      ]);
    });

    it('should treat undefined tokens as phonemes', () => {
      const rules = parseRules('a > b');
      expect(rules).toEqual([{ from: ['a'], to: ['b'] }]);
    });

    it('should allow variable names that look like phonemes', () => {
      const rules = parseRules('a = [b c]\na > x');
      expect(rules).toEqual([
        { from: ['b'], to: ['x'] },
        { from: ['c'], to: ['x'] }
      ]);
    });

    it('should handle deletion rules with variables', () => {
      const rules = parseRules('X = a\nX > ');
      expect(rules).toEqual([{ from: ['a'], to: [] }]);
    });

    it('should handle ∅ deletion rules with variables', () => {
      const rules = parseRules('X = a\nX > ∅');
      expect(rules).toEqual([{ from: ['a'], to: [] }]);
    });

    it('should allow comments mixed with variables', () => {
      const rules = parseRules(`
        # Define consonants
        C = [p t k];
        # Define vowels
        V = [a e i];
        # Apply rule
        C > V;
      `);
      // Paired class mapping: p>a, t>e, k>i
      expect(rules.length).toBe(3);
      expect(rules).toEqual([
        { from: ['p'], to: ['a'] },
        { from: ['t'], to: ['e'] },
        { from: ['k'], to: ['i'] }
      ]);
    });

    it('should handle variables in all rule positions simultaneously', () => {
      const rules = parseRules(`
        C = [p t];
        V = [a e];
        N = [m n];
        C > V / N _;
      `);
      // Paired from/to (2 rules) × context combinations (2) = 4 rules
      // p>a and t>e, each with leftContext m or n
      expect(rules.length).toBe(4);
      expect(rules).toEqual([
        { from: ['p'], to: ['a'], leftContext: ['m'], rightContext: undefined },
        { from: ['p'], to: ['a'], leftContext: ['n'], rightContext: undefined },
        { from: ['t'], to: ['e'], leftContext: ['m'], rightContext: undefined },
        { from: ['t'], to: ['e'], leftContext: ['n'], rightContext: undefined }
      ]);
    });

    it('should handle nested classes directly (without variables)', () => {
      const rules = parseRules('[[a b] [c d]] > x');
      expect(rules).toEqual([
        { from: ['a'], to: ['x'] },
        { from: ['b'], to: ['x'] },
        { from: ['c'], to: ['x'] },
        { from: ['d'], to: ['x'] }
      ]);
    });

    it('should handle complex nested structures', () => {
      const rules = parseRules(`
        VOICELESS = [p t k];
        VOICED = [b d g];
        STOPS = [VOICELESS VOICED];
        STOPS > x;
      `);
      expect(rules).toEqual([
        { from: ['p'], to: ['x'] },
        { from: ['t'], to: ['x'] },
        { from: ['k'], to: ['x'] },
        { from: ['b'], to: ['x'] },
        { from: ['d'], to: ['x'] },
        { from: ['g'], to: ['x'] }
      ]);
    });

    it('should not confuse variables with rule syntax', () => {
      const rules = parseRules('a = b\na > x');
      expect(rules).toEqual([{ from: ['b'], to: ['x'] }]);
    });

    it('should handle variables with special regex characters in names', () => {
      const rules = parseRules('C+V = [a]\nC+V > x');
      expect(rules).toEqual([{ from: ['a'], to: ['x'] }]);
    });
  });

  describe('embedded classes in context', () => {
    it('should expand embedded class in right context', () => {
      const rules = parseRules('a > b / _ [d e] f');
      expect(rules).toEqual([
        { from: ['a'], to: ['b'], leftContext: undefined, rightContext: ['d', 'f'] },
        { from: ['a'], to: ['b'], leftContext: undefined, rightContext: ['e', 'f'] }
      ]);
    });

    it('should expand embedded class in left context', () => {
      const rules = parseRules('a > b / c [x y] _');
      expect(rules).toEqual([
        { from: ['a'], to: ['b'], leftContext: ['c', 'x'], rightContext: undefined },
        { from: ['a'], to: ['b'], leftContext: ['c', 'y'], rightContext: undefined }
      ]);
    });

    it('should expand embedded classes in both contexts', () => {
      const rules = parseRules('a > b / c [x y] _ [p q] d');
      expect(rules).toEqual([
        { from: ['a'], to: ['b'], leftContext: ['c', 'x'], rightContext: ['p', 'd'] },
        { from: ['a'], to: ['b'], leftContext: ['c', 'x'], rightContext: ['q', 'd'] },
        { from: ['a'], to: ['b'], leftContext: ['c', 'y'], rightContext: ['p', 'd'] },
        { from: ['a'], to: ['b'], leftContext: ['c', 'y'], rightContext: ['q', 'd'] }
      ]);
    });
  });

  describe('optional groups in context', () => {
    it('simple optional left context', () => {
      const rules = parseRules('a > b / (c) _');
      expect(rules).toEqual([
        { from: ['a'], to: ['b'], leftContext: ['c'], rightContext: undefined },
        { from: ['a'], to: ['b'], leftContext: undefined, rightContext: undefined }
      ]);
    });

    it('simple optional right context', () => {
      const rules = parseRules('a > b / _ (c)');
      expect(rules).toEqual([
        { from: ['a'], to: ['b'], leftContext: undefined, rightContext: ['c'] },
        { from: ['a'], to: ['b'], leftContext: undefined, rightContext: undefined }
      ]);
    });

    it('multiple optional elements (Cartesian product)', () => {
      const rules = parseRules('a > b / (c) _ (d)');
      expect(rules).toEqual([
        { from: ['a'], to: ['b'], leftContext: ['c'], rightContext: ['d'] },
        { from: ['a'], to: ['b'], leftContext: ['c'], rightContext: undefined },
        { from: ['a'], to: ['b'], leftContext: undefined, rightContext: ['d'] },
        { from: ['a'], to: ['b'], leftContext: undefined, rightContext: undefined }
      ]);
    });

    it('nested optional: (c (d))', () => {
      const rules = parseRules('a > b / (c (d)) _');
      expect(rules).toEqual([
        { from: ['a'], to: ['b'], leftContext: ['c', 'd'], rightContext: undefined },
        { from: ['a'], to: ['b'], leftContext: ['c'], rightContext: undefined },
        { from: ['a'], to: ['b'], leftContext: undefined, rightContext: undefined }
      ]);
    });

    it('optional multi-phoneme sequence', () => {
      const rules = parseRules('a > b / (c d) _');
      expect(rules).toEqual([
        { from: ['a'], to: ['b'], leftContext: ['c', 'd'], rightContext: undefined },
        { from: ['a'], to: ['b'], leftContext: undefined, rightContext: undefined }
      ]);
    });

    it('optional with class inside', () => {
      const rules = parseRules('a > b / ([x y]) _');
      expect(rules).toEqual([
        { from: ['a'], to: ['b'], leftContext: ['x'], rightContext: undefined },
        { from: ['a'], to: ['b'], leftContext: ['y'], rightContext: undefined },
        { from: ['a'], to: ['b'], leftContext: undefined, rightContext: undefined }
      ]);
    });

    it('optional combined with fixed', () => {
      const rules = parseRules('a > b / c (d) _');
      expect(rules).toEqual([
        { from: ['a'], to: ['b'], leftContext: ['c', 'd'], rightContext: undefined },
        { from: ['a'], to: ['b'], leftContext: ['c'], rightContext: undefined }
      ]);
    });
  });

  describe('negative sets', () => {
    it('should expand simple negative set in left context', () => {
      const rules = parseRules('a > b / ![p t] _');
      // Should expand to all phonemes except p and t
      // Phonemes in ruleset: a, b, p, t
      // Negative set ![p t] expands to [a b]
      expect(rules.length).toBe(2);
      expect(rules).toContainEqual({ from: ['a'], to: ['b'], leftContext: ['a'] });
      expect(rules).toContainEqual({ from: ['a'], to: ['b'], leftContext: ['b'] });
    });

    it('should expand negative set in right context', () => {
      const rules = parseRules('a > b / _ ![x y]');
      // Phonemes: a, b, x, y
      // ![x y] expands to [a b]
      expect(rules.length).toBe(2);
      expect(rules).toContainEqual({ from: ['a'], to: ['b'], rightContext: ['a'] });
      expect(rules).toContainEqual({ from: ['a'], to: ['b'], rightContext: ['b'] });
    });

    it('should expand negative set on both sides', () => {
      const rules = parseRules('a > b / ![p] _ ![q]');
      // Phonemes: a, b, p, q
      // ![p] expands to [a b q]
      // ![q] expands to [a b p]
      expect(rules.length).toBe(9); // 3 * 3 = 9
    });

    it('should work with multi-character phonemes in negative set', () => {
      const rules = parseRules('a > b / ![th sh] _');
      // Phonemes: a, b, th, sh
      // ![th sh] expands to [a b]
      expect(rules.length).toBe(2);
      expect(rules).toContainEqual({ from: ['a'], to: ['b'], leftContext: ['a'] });
      expect(rules).toContainEqual({ from: ['a'], to: ['b'], leftContext: ['b'] });
    });

    it('should combine negative set with regular class', () => {
      const rules = parseRules('[a e] > [x y] / ![p t] _');
      // Phonemes: a, e, x, y, p, t
      // ![p t] expands to [a e x y]
      // Combined with [a e] > [x y], we get 2 * 4 = 8 rules
      expect(rules.length).toBe(8);
    });

    it('should work with variables containing negative sets', () => {
      const rules = parseRules(`
        C = [p t k];
        V = [a e i];
        V > x / ![C] _;
      `);
      // After variable substitution: V > x / ![[p t k]] _;
      // Which becomes: V > x / ![p t k] _;
      // Phonemes: p, t, k, a, e, i, x
      // ![p t k] expands to [a e i x]
      // V expands to [a e i]
      // So we get 3 * 4 = 12 rules
      expect(rules.length).toBe(12);
    });

    it('should handle empty negative set (all phonemes)', () => {
      const rules = parseRules('a > b / ![] _');
      // Empty negative set expands to all phonemes
      // Phonemes: a, b
      expect(rules.length).toBe(2);
      expect(rules).toContainEqual({ from: ['a'], to: ['b'], leftContext: ['a'] });
      expect(rules).toContainEqual({ from: ['a'], to: ['b'], leftContext: ['b'] });
    });

    it('should throw error if negative set excludes all phonemes', () => {
      expect(() => {
        parseRules('a > b / ![a b] _');
      }).toThrow('excludes all phonemes');
    });

    it('should handle word boundary in negative set context', () => {
      const rules = parseRules('a > b / ![#] _');
      // Phonemes: a, b, # (but # is filtered out in collectAllPhonemes)
      // So ![#] expands to [a b]
      expect(rules.length).toBe(2);
    });

    it('should work in complex context with multiple negative sets', () => {
      const rules = parseRules('a > b / ![p] _ ![q]');
      // Phonemes: a, b, p, q
      // ![p] expands to [a b q]
      // ![q] expands to [a b p]
      expect(rules.length).toBe(9);
    });
  });
});
