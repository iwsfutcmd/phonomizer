import { describe, it, expect } from 'vitest';
import { parseRules } from './parser';

describe('parseRules', () => {
  it('should parse simple rules', () => {
    const rules = parseRules('a > x;\nb > y;');
    expect(rules).toEqual([
      { from: 'a', to: 'x' },
      { from: 'b', to: 'y' }
    ]);
  });

  it('should handle whitespace around >', () => {
    const rules = parseRules('a>x;\nb  >  y;');
    expect(rules).toEqual([
      { from: 'a', to: 'x' },
      { from: 'b', to: 'y' }
    ]);
  });

  it('should handle empty lines', () => {
    const rules = parseRules('a > x;\n\nb > y;\n');
    expect(rules).toEqual([
      { from: 'a', to: 'x' },
      { from: 'b', to: 'y' }
    ]);
  });

  it('should handle comments', () => {
    const rules = parseRules('# This is a comment\na > x;\n# Another comment\nb > y;');
    expect(rules).toEqual([
      { from: 'a', to: 'x' },
      { from: 'b', to: 'y' }
    ]);
  });

  it('should allow empty target (deletion)', () => {
    const rules = parseRules('a > ;');
    expect(rules).toEqual([{ from: 'a', to: '' }]);
  });

  it('should handle multi-character phonemes', () => {
    const rules = parseRules('th > x;\nsh > y;');
    expect(rules).toEqual([
      { from: 'th', to: 'x' },
      { from: 'sh', to: 'y' }
    ]);
  });

  it('should throw error if semicolon is missing', () => {
    expect(() => parseRules('a > x')).toThrow('must end with semicolon');
  });

  it('should throw error if > is missing', () => {
    expect(() => parseRules('a x;')).toThrow('must have format');
  });

  it('should throw error if source is empty', () => {
    expect(() => parseRules(' > x;')).toThrow('cannot be empty');
  });

  it('should parse rule with left context (word boundary)', () => {
    const rules = parseRules('w > j / # _;');
    expect(rules).toEqual([
      { from: 'w', to: 'j', leftContext: '#', rightContext: undefined }
    ]);
  });

  it('should parse rule with right context (word boundary)', () => {
    const rules = parseRules('t > d / _ #;');
    expect(rules).toEqual([
      { from: 't', to: 'd', leftContext: undefined, rightContext: '#' }
    ]);
  });

  it('should parse rule with both contexts', () => {
    const rules = parseRules('a > e / b _ c;');
    expect(rules).toEqual([
      { from: 'a', to: 'e', leftContext: 'b', rightContext: 'c' }
    ]);
  });

  it('should parse rule with left phoneme context', () => {
    const rules = parseRules('k > g / n _;');
    expect(rules).toEqual([
      { from: 'k', to: 'g', leftContext: 'n', rightContext: undefined }
    ]);
  });

  it('should throw error if context missing underscore', () => {
    expect(() => parseRules('a > x / # #;')).toThrow('must contain _ to mark phoneme position');
  });

  describe('phoneme classes', () => {
    it('should parse simple class expansion: [a b] > c;', () => {
      const rules = parseRules('[a b] > c;');
      expect(rules).toEqual([
        { from: 'a', to: 'c' },
        { from: 'b', to: 'c' }
      ]);
    });

    it('should parse paired classes: [a b] > [x y];', () => {
      const rules = parseRules('[a b] > [x y];');
      expect(rules).toEqual([
        { from: 'a', to: 'x' },
        { from: 'b', to: 'y' }
      ]);
    });

    it('should parse class with three phonemes', () => {
      const rules = parseRules('[a b c] > [x y z];');
      expect(rules).toEqual([
        { from: 'a', to: 'x' },
        { from: 'b', to: 'y' },
        { from: 'c', to: 'z' }
      ]);
    });

    it('should parse class in left context: a > b / [c d] _;', () => {
      const rules = parseRules('a > b / [c d] _;');
      expect(rules).toEqual([
        { from: 'a', to: 'b', leftContext: 'c', rightContext: undefined },
        { from: 'a', to: 'b', leftContext: 'd', rightContext: undefined }
      ]);
    });

    it('should parse class in right context: a > b / _ [c d];', () => {
      const rules = parseRules('a > b / _ [c d];');
      expect(rules).toEqual([
        { from: 'a', to: 'b', leftContext: undefined, rightContext: 'c' },
        { from: 'a', to: 'b', leftContext: undefined, rightContext: 'd' }
      ]);
    });

    it('should handle class with multi-character phonemes: [th sh] > [θ ʃ];', () => {
      const rules = parseRules('[th sh] > [θ ʃ];');
      expect(rules).toEqual([
        { from: 'th', to: 'θ' },
        { from: 'sh', to: 'ʃ' }
      ]);
    });

    it('should expand multiple classes: [a b] > [x y] / [c d] _;', () => {
      const rules = parseRules('[a b] > [x y] / [c d] _;');
      expect(rules).toEqual([
        { from: 'a', to: 'x', leftContext: 'c', rightContext: undefined },
        { from: 'a', to: 'x', leftContext: 'd', rightContext: undefined },
        { from: 'b', to: 'y', leftContext: 'c', rightContext: undefined },
        { from: 'b', to: 'y', leftContext: 'd', rightContext: undefined }
      ]);
    });

    it('should expand classes in both contexts', () => {
      const rules = parseRules('a > b / [c d] _ [e f];');
      expect(rules).toEqual([
        { from: 'a', to: 'b', leftContext: 'c', rightContext: 'e' },
        { from: 'a', to: 'b', leftContext: 'c', rightContext: 'f' },
        { from: 'a', to: 'b', leftContext: 'd', rightContext: 'e' },
        { from: 'a', to: 'b', leftContext: 'd', rightContext: 'f' }
      ]);
    });

    it('should expand [a b c] > d; to three rules', () => {
      const rules = parseRules('[a b c] > d;');
      expect(rules).toEqual([
        { from: 'a', to: 'd' },
        { from: 'b', to: 'd' },
        { from: 'c', to: 'd' }
      ]);
    });

    it('should handle whitespace inside classes', () => {
      const rules = parseRules('[  a   b  ] > [x y];');
      expect(rules).toEqual([
        { from: 'a', to: 'x' },
        { from: 'b', to: 'y' }
      ]);
    });

    it('should throw error if target is class but source is not', () => {
      expect(() => parseRules('a > [x y];')).toThrow('Class in target requires class in source');
    });

    it('should throw error if class lengths do not match', () => {
      expect(() => parseRules('[a b] > [x y z];')).toThrow('Class lengths must match');
    });

    it('should throw error if class is empty', () => {
      expect(() => parseRules('[] > x;')).toThrow('Class cannot be empty');
    });

    it('should work with deletion: [a b] > ;', () => {
      const rules = parseRules('[a b] > ;');
      expect(rules).toEqual([
        { from: 'a', to: '' },
        { from: 'b', to: '' }
      ]);
    });

    it('should handle complex Unicode in classes', () => {
      const rules = parseRules('[ɬ ɬʼ] > [ʃ dˤ];');
      expect(rules).toEqual([
        { from: 'ɬ', to: 'ʃ' },
        { from: 'ɬʼ', to: 'dˤ' }
      ]);
    });
  });
});
