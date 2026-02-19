import { describe, it, expect } from 'vitest';
import { parsePhonemeFile, isPhonotacticallyValid } from './phonotactics';

describe('parsePhonemeFile', () => {
  it('should parse backward compatible format (no sections)', () => {
    const content = 'a b c d e';
    const result = parsePhonemeFile(content);

    expect(result.inventory).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(result.patterns).toEqual([]);
    expect(result.variables.size).toBe(0);
  });

  it('should parse backward compatible format with commas', () => {
    const content = 'a, b, c, d, e';
    const result = parsePhonemeFile(content);

    expect(result.inventory).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('should parse inventory section', () => {
    const content = `
[inventory]
p t k
a e i
    `;
    const result = parsePhonemeFile(content);

    expect(result.inventory).toEqual(['p', 't', 'k', 'a', 'e', 'i']);
    expect(result.patterns).toEqual([]);
  });

  it('should parse phonotactics section with variables', () => {
    const content = `
[inventory]
p t k a e i

[phonotactics]
C = [p t k];
V = [a e i];
C V
C V C
    `;
    const result = parsePhonemeFile(content);

    expect(result.inventory).toEqual(['p', 't', 'k', 'a', 'e', 'i']);
    expect(result.patterns).toEqual(['C V', 'C V C']);
    expect(result.variables.get('C')).toBe('[p t k]');
    expect(result.variables.get('V')).toBe('[a e i]');
  });

  it('should parse multiple patterns', () => {
    const content = `
[inventory]
p a

[phonotactics]
C = [p];
V = [a];
V
C V
C V C
C V C V C
    `;
    const result = parsePhonemeFile(content);

    expect(result.patterns).toEqual(['V', 'C V', 'C V C', 'C V C V C']);
  });

  it('should skip comments and empty lines', () => {
    const content = `
[inventory]
# This is a comment
p t k

# Another comment
a e i

[phonotactics]
# Define classes
C = [p t k];
V = [a e i];

# Valid patterns
C V
C V C
    `;
    const result = parsePhonemeFile(content);

    expect(result.inventory).toEqual(['p', 't', 'k', 'a', 'e', 'i']);
    expect(result.patterns).toEqual(['C V', 'C V C']);
  });
});

describe('isPhonotacticallyValid', () => {
  it('should accept any word when no patterns defined (backward compatible)', () => {
    const data = parsePhonemeFile('p t k a e i');

    expect(isPhonotacticallyValid('pa', data)).toBe(true);
    expect(isPhonotacticallyValid('apa', data)).toBe(true);
    expect(isPhonotacticallyValid('pataki', data)).toBe(true);
  });

  it('should validate simple CV pattern', () => {
    const content = `
[inventory]
p t k a e i

[phonotactics]
C = [p t k];
V = [a e i];
C V
    `;
    const data = parsePhonemeFile(content);

    expect(isPhonotacticallyValid('pa', data)).toBe(true);
    expect(isPhonotacticallyValid('te', data)).toBe(true);
    expect(isPhonotacticallyValid('ki', data)).toBe(true);

    expect(isPhonotacticallyValid('a', data)).toBe(false);   // Just V
    expect(isPhonotacticallyValid('p', data)).toBe(false);   // Just C
    expect(isPhonotacticallyValid('pap', data)).toBe(false); // CVC
  });

  it('should validate multiple patterns', () => {
    const content = `
[inventory]
p t k a e i

[phonotactics]
C = [p t k];
V = [a e i];
V
C V
C V C
    `;
    const data = parsePhonemeFile(content);

    expect(isPhonotacticallyValid('a', data)).toBe(true);     // V
    expect(isPhonotacticallyValid('pa', data)).toBe(true);    // CV
    expect(isPhonotacticallyValid('pat', data)).toBe(true);   // CVC

    expect(isPhonotacticallyValid('p', data)).toBe(false);    // C
    expect(isPhonotacticallyValid('pata', data)).toBe(false); // CVCV
  });

  it('should work with multi-character phonemes', () => {
    const content = `
[inventory]
th sh a e i

[phonotactics]
C = [th sh];
V = [a e i];
C V
    `;
    const data = parsePhonemeFile(content);

    expect(isPhonotacticallyValid('tha', data)).toBe(true);
    expect(isPhonotacticallyValid('she', data)).toBe(true);

    expect(isPhonotacticallyValid('a', data)).toBe(false);
    expect(isPhonotacticallyValid('th', data)).toBe(false);
  });

  it('should validate Middle Chinese structure (IFT)', () => {
    const content = `
[inventory]
i1 i2 i3
f1 f2 f3
t1 t2

[phonotactics]
I = [i1 i2 i3];
F = [f1 f2 f3];
T = [t1 t2];
I F T
    `;
    const data = parsePhonemeFile(content);

    expect(isPhonotacticallyValid('i1f1t1', data)).toBe(true);
    expect(isPhonotacticallyValid('i2f3t2', data)).toBe(true);

    expect(isPhonotacticallyValid('i1f1', data)).toBe(false);     // Missing tone
    expect(isPhonotacticallyValid('i1f1t1t2', data)).toBe(false); // Double tone
    expect(isPhonotacticallyValid('f1t1', data)).toBe(false);     // Missing initial
  });

  it('should handle complex patterns', () => {
    const content = `
[inventory]
p t k a e i m n

[phonotactics]
C = [p t k];
V = [a e i];
N = [m n];
C V
C V C
C V N
C V C V C
    `;
    const data = parsePhonemeFile(content);

    expect(isPhonotacticallyValid('pa', data)).toBe(true);     // CV
    expect(isPhonotacticallyValid('pak', data)).toBe(true);    // CVC
    expect(isPhonotacticallyValid('pan', data)).toBe(true);    // CVN
    expect(isPhonotacticallyValid('patap', data)).toBe(true);  // CVCVC

    expect(isPhonotacticallyValid('pana', data)).toBe(false);  // CVCV (not in patterns)
  });

  it('should reject words with invalid phonemes', () => {
    const content = `
[inventory]
p t a e

[phonotactics]
C = [p t];
V = [a e];
C V
    `;
    const data = parsePhonemeFile(content);

    // 'x' is not in inventory
    expect(isPhonotacticallyValid('xa', data)).toBe(false);
    expect(isPhonotacticallyValid('px', data)).toBe(false);
  });
});
