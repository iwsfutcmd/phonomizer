# Phoneme Classes Implementation

This document describes the phoneme classes feature implemented in the Phonomizer rule parser.

## Overview

Phoneme classes provide a syntactic shorthand for writing multiple related rules. Classes are expanded at parse time into individual rules, keeping the core rule engine unchanged.

## Syntax

Classes are denoted by square brackets `[ ]` containing space-separated phonemes:

```
[a b c]     # A class containing phonemes a, b, and c
[th sh]     # A class containing multi-character phonemes th and sh
```

## Expansion Rules

### 1. Simple Class Expansion (Merger)

When only the source is a class:

```
[a b] > c;
```

Expands to:
```
a > c;
b > c;
```

### 2. Paired Class Mapping

When both source and target are classes of equal length:

```
[a b c] > [x y z];
```

Expands to:
```
a > x;
b > y;
c > z;
```

### 3. Classes in Context

Classes can appear in left or right context:

```
a > b / [c d] _;
```

Expands to:
```
a > b / c _;
a > b / d _;
```

### 4. Multiple Classes (Cartesian Product)

When multiple classes appear in one rule:

```
[a b] > [x y] / [c d] _;
```

Expands to 4 rules:
```
a > x / c _;
a > x / d _;
b > y / c _;
b > y / d _;
```

## Validation

The parser enforces these constraints:

1. **Target class requires source class**: If the target is a class, the source must also be a class
   ```
   a > [x y];      # ERROR
   ```

2. **Paired mapping requires equal lengths**: When both source and target are classes, they must have the same number of phonemes
   ```
   [a b] > [x y z];    # ERROR: 2 phonemes vs 3 phonemes
   ```

3. **No empty classes**: Classes must contain at least one phoneme
   ```
   [] > x;     # ERROR
   ```

## Implementation Details

### Parse-Time Expansion

Classes are expanded during parsing, not at application time. This approach:
- Keeps the `Rule` type unchanged
- Requires no changes to the engine or reverser
- Makes debugging easier (all rules are explicit)
- Has minimal performance impact (expansion happens once)

### Helper Functions

**`extractClass(str: string): string[] | null`**
- Detects `[...]` syntax and extracts phonemes
- Returns `null` if the string is not a class
- Validates that classes are non-empty

**`expandRule(baseRule, lineNum, originalLine): Rule[]`**
- Takes a parsed rule that may contain classes
- Validates class constraints
- Generates all expanded rules via Cartesian product
- Returns an array of concrete rules

### Test Coverage

The implementation includes comprehensive tests in:
- `parser.test.ts` - 16 tests for class parsing and validation
- `engine.test.ts` - 5 integration tests for forward application
- `reverser.test.ts` - 5 integration tests for backward application

Total: **71 tests pass** (including existing tests)

## Examples

### Example 1: Devoicing

```
[b d g] > [p t k];
```

This creates three rules that devoice the voiced stops:
- b → p
- d → t
- g → k

### Example 2: Voicing After Nasals

```
[p t k] > [b d g] / [m n] _;
```

This creates 6 rules (3 consonants × 2 nasals):
- p → b after m
- p → b after n
- t → d after m
- t → d after n
- k → g after m
- k → g after n

### Example 3: Phoneme Merger

```
[ʕ ʔ] > ;
```

This deletes both pharyngeal and glottal stops:
- ʕ → (deleted)
- ʔ → (deleted)

## Benefits

1. **Conciseness**: Write one line instead of many similar rules
2. **Readability**: Express phonological patterns more naturally
3. **Maintainability**: Update multiple rules by changing one line
4. **Correctness**: Automatic expansion prevents copy-paste errors

## Backward Compatibility

All existing rulesets continue to work without changes. The parser only activates class expansion when it detects `[` and `]` characters.
