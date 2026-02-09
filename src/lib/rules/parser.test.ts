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
});
