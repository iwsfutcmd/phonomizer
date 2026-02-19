import { describe, it, expect } from 'vitest';
import { parsePhonemesFile, parsePhonotacticsFile } from './parser';

describe('parsePhonemesFile', () => {
  describe('legacy format', () => {
    it('should parse a flat list of phonemes', () => {
      const result = parsePhonemesFile('a b c d e');
      expect(result.phonemes).toEqual(['a', 'b', 'c', 'd', 'e']);
      expect(result.phonotactics).toBeNull();
    });

    it('should handle comma-separated phonemes', () => {
      const result = parsePhonemesFile('a, b, c');
      expect(result.phonemes).toEqual(['a', 'b', 'c']);
      expect(result.phonotactics).toBeNull();
    });

    it('should handle multi-character phonemes', () => {
      const result = parsePhonemesFile('th sh a i');
      expect(result.phonemes).toEqual(['th', 'sh', 'a', 'i']);
    });

    it('should handle empty input', () => {
      const result = parsePhonemesFile('');
      expect(result.phonemes).toEqual([]);
      expect(result.phonotactics).toBeNull();
    });

    it('should handle whitespace-only input', () => {
      const result = parsePhonemesFile('   \n  ');
      expect(result.phonemes).toEqual([]);
      expect(result.phonotactics).toBeNull();
    });
  });

  describe('section format', () => {
    it('should parse inventory section', () => {
      const result = parsePhonemesFile('[inventory]\na b c');
      expect(result.phonemes).toEqual(['a', 'b', 'c']);
      expect(result.phonotactics).toBeNull();
    });

    it('should parse inventory and phonotactics sections', () => {
      const input = `[inventory]
a b p t

[phonotactics]
C = [p t];
V = [a b];

CV
CVC`;
      const result = parsePhonemesFile(input);
      expect(result.phonemes).toEqual(['a', 'b', 'p', 't']);
      expect(result.phonotactics).not.toBeNull();
      expect(result.phonotactics!.length).toBe(2);
    });

    it('should expand variables in patterns', () => {
      const input = `[inventory]
a i p t

[phonotactics]
C = [p t];
V = [a i];

CV`;
      const result = parsePhonemesFile(input);
      expect(result.phonotactics!.length).toBe(1);
      const pattern = result.phonotactics![0];
      expect(pattern.positions.length).toBe(2);
      expect(pattern.positions[0]).toEqual(['p', 't']);
      expect(pattern.positions[1]).toEqual(['a', 'i']);
    });

    it('should handle nested variable references', () => {
      const input = `[inventory]
a i p t b d

[phonotactics]
VOICELESS = [p t];
VOICED = [b d];
C = [VOICELESS VOICED];
V = [a i];

CV`;
      const result = parsePhonemesFile(input);
      const pattern = result.phonotactics![0];
      expect(pattern.positions[0]).toEqual(['p', 't', 'b', 'd']);
    });

    it('should handle single-value variables', () => {
      const input = `[inventory]
a p

[phonotactics]
X = p;
V = [a];

XV`;
      const result = parsePhonemesFile(input);
      const pattern = result.phonotactics![0];
      expect(pattern.positions[0]).toEqual(['p']);
      expect(pattern.positions[1]).toEqual(['a']);
    });

    it('should handle phonemes as literal tokens in patterns', () => {
      const input = `[inventory]
a b p t

[phonotactics]
C = [p t];

Ca`;
      const result = parsePhonemesFile(input);
      const pattern = result.phonotactics![0];
      expect(pattern.positions[0]).toEqual(['p', 't']);
      expect(pattern.positions[1]).toEqual(['a']);
    });

    it('should handle multiple patterns', () => {
      const input = `[inventory]
a i p t

[phonotactics]
C = [p t];
V = [a i];

V
CV
CVC
CVVC`;
      const result = parsePhonemesFile(input);
      expect(result.phonotactics!.length).toBe(4);
      expect(result.phonotactics![0].positions.length).toBe(1); // V
      expect(result.phonotactics![1].positions.length).toBe(2); // CV
      expect(result.phonotactics![2].positions.length).toBe(3); // CVC
      expect(result.phonotactics![3].positions.length).toBe(4); // CVVC
    });

    it('should skip comments and blank lines in phonotactics', () => {
      const input = `[inventory]
a p

[phonotactics]
# This is a comment
C = [p];
V = [a];

# Another comment
CV`;
      const result = parsePhonemesFile(input);
      expect(result.phonotactics!.length).toBe(1);
    });

    it('should handle multi-character phonemes in variables', () => {
      const input = `[inventory]
a th sh

[phonotactics]
C = [th sh];
V = [a];

CV`;
      const result = parsePhonemesFile(input);
      const pattern = result.phonotactics![0];
      expect(pattern.positions[0]).toEqual(['th', 'sh']);
    });

    it('should use greedy longest-match for pattern tokenization', () => {
      const input = `[inventory]
a i p t

[phonotactics]
CV = [p t];
C = [p];
V = [a i];

CVa`;
      const result = parsePhonemesFile(input);
      // "CVa" should match "CV" first (greedy longest match), then "a"
      const pattern = result.phonotactics![0];
      expect(pattern.positions.length).toBe(2);
      expect(pattern.positions[0]).toEqual(['p', 't']); // CV variable
      expect(pattern.positions[1]).toEqual(['a']); // literal phoneme
    });

    it('should handle space-separated tokens in patterns', () => {
      const input = `[inventory]
a i p t

[phonotactics]
C = [p t];
V = [a i];

C V C`;
      const result = parsePhonemesFile(input);
      expect(result.phonotactics!.length).toBe(1);
      const pattern = result.phonotactics![0];
      expect(pattern.positions.length).toBe(3);
      expect(pattern.positions[0]).toEqual(['p', 't']);
      expect(pattern.positions[1]).toEqual(['a', 'i']);
      expect(pattern.positions[2]).toEqual(['p', 't']);
    });

    it('should expand simple optional group in pattern', () => {
      const input = `[inventory]
a i p t

[phonotactics]
C = [p t];
V = [a i];

(C) V`;
      const result = parsePhonemesFile(input);
      // "(C) V" expands to "C V" and "V"
      expect(result.phonotactics!.length).toBe(2);
      expect(result.phonotactics![0].positions.length).toBe(2); // C V
      expect(result.phonotactics![1].positions.length).toBe(1); // V
    });

    it('should expand multiple optional groups (Cartesian product)', () => {
      const input = `[inventory]
a i p t m

[phonotactics]
C = [p t];
V = [a i];
N = [m];

(C) V (N)`;
      const result = parsePhonemesFile(input);
      // "(C) V (N)" expands to: "C V N", "C V", "V N", "V"
      expect(result.phonotactics!.length).toBe(4);
      expect(result.phonotactics![0].positions.length).toBe(3); // C V N
      expect(result.phonotactics![1].positions.length).toBe(2); // C V
      expect(result.phonotactics![2].positions.length).toBe(2); // V N
      expect(result.phonotactics![3].positions.length).toBe(1); // V
    });

    it('should expand nested optional groups', () => {
      const input = `[inventory]
a i p t m

[phonotactics]
C = [p t];
V = [a i];
N = [m];

(C (N)) V`;
      const result = parsePhonemesFile(input);
      // "(C (N)) V" → "C N V", "C V", "V"
      expect(result.phonotactics!.length).toBe(3);
      expect(result.phonotactics![0].positions.length).toBe(3); // C N V
      expect(result.phonotactics![1].positions.length).toBe(2); // C V
      expect(result.phonotactics![2].positions.length).toBe(1); // V
    });

    it('should throw on unrecognized token in pattern', () => {
      const input = `[inventory]
a p

[phonotactics]
C = [p];

CX`;
      expect(() => parsePhonemesFile(input)).toThrow('unrecognized token');
    });

    it('should strip trailing semicolons from pattern lines', () => {
      const input = `[inventory]
a p

[phonotactics]
C = [p];
V = [a];

CV;`;
      const result = parsePhonemesFile(input);
      expect(result.phonotactics!.length).toBe(1);
      const pattern = result.phonotactics![0];
      expect(pattern.positions.length).toBe(2);
      expect(pattern.positions[0]).toEqual(['p']);
      expect(pattern.positions[1]).toEqual(['a']);
    });

    it('should handle variable referencing another variable', () => {
      const input = `[inventory]
a p

[phonotactics]
A = [p];
B = A;

Ba`;
      const result = parsePhonemesFile(input);
      const pattern = result.phonotactics![0];
      expect(pattern.positions[0]).toEqual(['p']);
    });
  });
});

describe('parsePhonotacticsFile', () => {
  it('should parse variables and patterns, deriving phoneme inventory', () => {
    const input = `C = [p t k]
V = [a e i]

CV
CVC`;
    const result = parsePhonotacticsFile(input);
    expect(result.phonemes.sort()).toEqual(['a', 'e', 'i', 'k', 'p', 't']);
    expect(result.phonotactics).not.toBeNull();
    expect(result.phonotactics!.length).toBe(2);
    expect(result.phonotactics![0].positions).toEqual([['p', 't', 'k'], ['a', 'e', 'i']]);
    expect(result.phonotactics![1].positions).toEqual([['p', 't', 'k'], ['a', 'e', 'i'], ['p', 't', 'k']]);
  });

  it('should filter ∅ from derived phoneme inventory', () => {
    const input = `I = [∅ p t k]
V = [a e i]

I V`;
    const result = parsePhonotacticsFile(input);
    expect(result.phonemes).not.toContain('∅');
    expect(result.phonemes.sort()).toEqual(['a', 'e', 'i', 'k', 'p', 't']);
  });

  it('should filter # from derived phoneme inventory', () => {
    const input = `C = [p t]
V = [a]
B = [#]

C V`;
    const result = parsePhonotacticsFile(input);
    expect(result.phonemes).not.toContain('#');
    expect(result.phonemes.sort()).toEqual(['a', 'p', 't']);
  });

  it('should return phonotactics: null when no pattern lines', () => {
    const input = `I = [p t k]
V = [a e i]`;
    const result = parsePhonotacticsFile(input);
    expect(result.phonemes.sort()).toEqual(['a', 'e', 'i', 'k', 'p', 't']);
    expect(result.phonotactics).toBeNull();
  });

  it('should ignore [phonotactics] section header if present', () => {
    const input = `[phonotactics]
C = [p t]
V = [a e]

CV`;
    const result = parsePhonotacticsFile(input);
    expect(result.phonemes.sort()).toEqual(['a', 'e', 'p', 't']);
    expect(result.phonotactics!.length).toBe(1);
  });

  it('should handle nested variable references', () => {
    const input = `VOICELESS = [p t]
VOICED = [b d]
C = [VOICELESS VOICED]
V = [a e]

CV`;
    const result = parsePhonotacticsFile(input);
    expect(result.phonemes.sort()).toEqual(['a', 'b', 'd', 'e', 'p', 't']);
    expect(result.phonotactics![0].positions[0]).toEqual(['p', 't', 'b', 'd']);
  });

  it('should handle optional groups in patterns', () => {
    const input = `C = [p t]
V = [a e]
N = [m n]

(C) V (N)`;
    const result = parsePhonotacticsFile(input);
    // (C) V (N) → CV N, CV, VN, V
    expect(result.phonotactics!.length).toBe(4);
  });

  it('parsePhonemesFile auto-detects phonotactics format', () => {
    const input = `C = [p t]
V = [a e]

CV`;
    const result = parsePhonemesFile(input);
    expect(result.phonemes.sort()).toEqual(['a', 'e', 'p', 't']);
    expect(result.phonotactics!.length).toBe(1);
  });
});
