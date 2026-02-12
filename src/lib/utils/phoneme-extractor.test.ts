import { describe, it, expect } from 'vitest';
import { extractPhonemes, generatePhonemeFiles } from './phoneme-extractor';

describe('extractPhonemes', () => {
  it('should extract basic source and target phonemes', () => {
    const rules = 'a > e;\nb > o;';
    const result = extractPhonemes(rules);

    expect(result.source).toContain('a');
    expect(result.source).toContain('b');
    expect(result.target).toContain('e');
    expect(result.target).toContain('o');
  });

  it('should handle phonemes in context', () => {
    const rules = 'a > e / t _ n;';
    const result = extractPhonemes(rules);

    expect(result.source).toContain('a');
    expect(result.source).toContain('t');
    expect(result.source).toContain('n');
    expect(result.target).toContain('e');
    expect(result.target).toContain('t'); // Context phonemes pass through
    expect(result.target).toContain('n');
  });

  it('should identify intermediate phonemes', () => {
    const rules = `
      a > b;
      b > c;
    `;
    const result = extractPhonemes(rules);

    expect(result.source).toContain('a');
    expect(result.source).not.toContain('b'); // b is intermediate
    expect(result.target).toContain('c');
    expect(result.target).not.toContain('b'); // b is intermediate
    expect(result.intermediate).toContain('b');
  });

  it('should handle multi-step transformations', () => {
    const rules = `
      a > b;
      b > c;
      c > d;
    `;
    const result = extractPhonemes(rules);

    expect(result.source).toEqual(['a']);
    expect(result.target).toEqual(['d']);
    expect(result.intermediate).toContain('b');
    expect(result.intermediate).toContain('c');
  });

  it('should handle phoneme classes', () => {
    const rules = '[p t k] > [b d g];';
    const result = extractPhonemes(rules);

    expect(result.source).toContain('p');
    expect(result.source).toContain('t');
    expect(result.source).toContain('k');
    expect(result.target).toContain('b');
    expect(result.target).toContain('d');
    expect(result.target).toContain('g');
  });

  it('should handle variables', () => {
    const rules = `
      STOPS = [p t k];
      FRICATIVES = [f θ x];
      STOPS > FRICATIVES;
    `;
    const result = extractPhonemes(rules);

    expect(result.source).toContain('p');
    expect(result.source).toContain('t');
    expect(result.source).toContain('k');
    expect(result.target).toContain('f');
    expect(result.target).toContain('θ');
    expect(result.target).toContain('x');
  });

  it('should handle nested variable references', () => {
    const rules = `
      A = [p t];
      B = [k g];
      C = [A B];
      C > x;
    `;
    const result = extractPhonemes(rules);

    expect(result.source).toContain('p');
    expect(result.source).toContain('t');
    expect(result.source).toContain('k');
    expect(result.source).toContain('g');
    expect(result.target).toContain('x');
  });

  it('should preserve phonemes that are never transformed', () => {
    const rules = `
      a > e;
      # b is never transformed, so it should appear in both inventories
      c > i / b _;
    `;
    const result = extractPhonemes(rules);

    expect(result.source).toContain('a');
    expect(result.source).toContain('b');
    expect(result.source).toContain('c');
    expect(result.target).toContain('e');
    expect(result.target).toContain('i');
    expect(result.target).toContain('b'); // b passes through
  });

  it('should handle deletion rules', () => {
    const rules = 'h > ;';
    const result = extractPhonemes(rules);

    expect(result.source).toContain('h');
    expect(result.target).not.toContain('h');
    expect(result.target).not.toContain(''); // Empty string not included
  });

  it('should handle multi-character phonemes', () => {
    const rules = 'th sh > θ ʃ;';
    const result = extractPhonemes(rules);

    expect(result.source).toContain('th');
    expect(result.source).toContain('sh');
    expect(result.target).toContain('θ');
    expect(result.target).toContain('ʃ');
  });

  it('should handle word boundaries in context', () => {
    const rules = 't > d / _ #;';
    const result = extractPhonemes(rules);

    expect(result.source).toContain('t');
    expect(result.target).toContain('d');
    expect(result.source).not.toContain('#');
    expect(result.target).not.toContain('#');
  });

  it('should handle complex real-world example', () => {
    const rules = `
      # Define phoneme classes
      VOICELESS = [p t k];
      VOICED = [b d g];
      FRICATIVES = [f θ x];

      # Lenition chain: p→b, t→d, k→g
      VOICELESS > VOICED;
      # Then: b→f, d→θ, g→x
      VOICED > FRICATIVES;
    `;
    const result = extractPhonemes(rules);

    // Source should only have voiceless stops
    expect(result.source).toContain('p');
    expect(result.source).toContain('t');
    expect(result.source).toContain('k');

    // Target should only have fricatives
    expect(result.target).toContain('f');
    expect(result.target).toContain('θ');
    expect(result.target).toContain('x');

    // Voiced stops are intermediate
    expect(result.intermediate).toContain('b');
    expect(result.intermediate).toContain('d');
    expect(result.intermediate).toContain('g');
  });

  it('should handle phonemes that appear in multiple contexts', () => {
    const rules = `
      a > e / n _;
      o > u / _ n;
    `;
    const result = extractPhonemes(rules);

    expect(result.source).toContain('a');
    expect(result.source).toContain('o');
    expect(result.source).toContain('n');
    expect(result.target).toContain('e');
    expect(result.target).toContain('u');
    expect(result.target).toContain('n'); // n passes through
  });

  it('should not mark phonemes as intermediate if consumed only conditionally', () => {
    const rules = `
      a > b;
      b > c / _ d;
    `;
    const result = extractPhonemes(rules);

    // b is produced unconditionally but only consumed conditionally
    // Therefore b can pass through to target (when not before d)
    expect(result.source).toContain('a');
    expect(result.target).toContain('b'); // b is in target
    expect(result.target).toContain('c'); // c is also in target
    expect(result.intermediate).not.toContain('b'); // b is NOT intermediate
  });

  it('should mark phonemes as intermediate if consumed unconditionally', () => {
    const rules = `
      a > b;
      b > c;
    `;
    const result = extractPhonemes(rules);

    // b is produced and consumed unconditionally
    expect(result.source).toContain('a');
    expect(result.source).not.toContain('b');
    expect(result.target).toContain('c');
    expect(result.target).not.toContain('b');
    expect(result.intermediate).toContain('b'); // b IS intermediate
  });
});

describe('generatePhonemeFiles', () => {
  it('should generate space-separated phoneme strings', () => {
    const rules = 'a b > e o;';
    const result = generatePhonemeFiles(rules);

    expect(result.source).toMatch(/\ba\b/);
    expect(result.source).toMatch(/\bb\b/);
    expect(result.target).toMatch(/\be\b/);
    expect(result.target).toMatch(/\bo\b/);
  });

  it('should include intermediate phonemes when present', () => {
    const rules = 'a > b;\nb > c;';
    const result = generatePhonemeFiles(rules);

    expect(result.intermediate).toBeDefined();
    expect(result.intermediate).toContain('b');
  });

  it('should not include intermediate field when no intermediates', () => {
    const rules = 'a > e;';
    const result = generatePhonemeFiles(rules);

    expect(result.intermediate).toBeUndefined();
  });
});
