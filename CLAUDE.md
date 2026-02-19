# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Phonomizer is a webapp for applying historical phonological rules to words, both forward and backward.

**Forward application**: Given rules and a source word, produce the target word after all rules are applied.
**Backward application**: Given rules and a target word, produce all possible source words that could have generated that target.

**Phoneme Sets**: Users define the valid phoneme inventories for both source and target languages. This constrains the search space and prevents combinatorial explosion in backward application.

Example:
```
Source phonemes: a b c
Target phonemes: x y
Rules: a > x; b > y; c > x
```

- Forward: source "abc" → target "xyx"
- Backward: target "xyx" → sources ["abc", "cbc"] (only 2 results instead of 4, because "a" and "c" are valid source phonemes, but "x" and "y" are not)

## Development Commands

```bash
# Install dependencies
npm install

# Start development server with hot reload
npm run dev

# Run tests (run once)
npm test

# Run tests in watch mode
npm run test:watch

# Type-check the codebase
npm run check

# Build for production
npm run build

# Preview production build locally
npm run preview

# Generate phoneme files from a ruleset
npm run generate-phonemes <ruleset-file>
# Example: npm run generate-phonemes public/rules/sem-pro_arb.phono
```

**IMPORTANT**: Always run `npm test` after making changes to the rule engine to ensure correctness.

### Generating Phoneme Files

When adding a new ruleset, use the phoneme generator utility to automatically create the phoneme files:

```bash
npm run generate-phonemes public/rules/sem-pro_newlang.phono
```

This will:
1. Parse the ruleset file
2. Extract unique source phonemes (from the `from` field of each rule)
3. Extract unique target phonemes (from the `to` field of each rule)
4. Generate `source-lang.phonemes` and `target-lang.phonemes` files
5. Sort phonemes alphabetically for consistency
6. Preserve existing `[phonotactics]` sections when regenerating files that already have them

## Architecture

### Core Components

**Rule Engine** (`src/lib/rules/`)
- `parser.ts`: Parses rule syntax (e.g., "a > x") into structured rule objects
- `engine.ts`: Applies rules forward (source → target)
- `reverser.ts`: Applies rules backward (target → all possible sources)

**Rule Application Logic**:
- Rules are applied sequentially in order
- Each rule transforms the entire string before the next rule is applied
- Forward application is deterministic (one source → one target)
- Backward application is non-deterministic (one target → multiple possible sources)

**Key Algorithm Considerations**:
- Forward: Simple string replacement/pattern matching for each rule. Validates that source word uses only source phonemes. Optionally validates source word against source phonotactic constraints.
- Backward: Works through rules in reverse order. For each rule "a > x", every "x" in the current word could be:
  - Replaced with "a" (reverse the rule)
  - Left as "x" (only if "x" is in the source phoneme set - meaning it wasn't transformed by this rule)
- Deletion rule reversal: For deletion rules "h > ∅" (forward: h is deleted), backward application inserts the deleted phoneme at all valid positions that match the context. Phonemes from deletion rules are automatically added to valid source phonemes.
- Phoneme sets prevent explosion: Without phoneme sets, "xyx" with rules "a>x, c>x" generates 2³ = 8 combinations. With phoneme sets where "x" is not in the source set, we must replace all "x"s, giving only 4 valid results.
- Phonotactics further constrain backward results: candidates are filtered to only include words that match declared phonotactic patterns (valid word shapes).
- Uses greedy longest-match for multi-character phonemes (e.g., "th", "sh")

**Phonotactics** (`src/lib/phonotactics/`)
- `parser.ts`: Parses `.phonemes` files, handling both legacy (flat list) and section-based formats with `[inventory]` and `[phonotactics]` sections. Resolves variables and expands patterns (including optional groups).
- `matcher.ts`: Checks if a tokenized word matches any of the declared phonotactic patterns (OR logic). Returns true when phonotactics is null (unconstrained).

**UI Components** (`src/lib/components/`)
- `RuleEditor.svelte`: Input area for defining phonological rules
- `WordInput.svelte`: Input for the word to transform
- `ResultDisplay.svelte`: Shows transformation results (single output for forward, list of possibilities for backward)
- `DirectionToggle.svelte`: Toggle between forward and backward mode

### Project Structure

```
src/
├── lib/
│   ├── rules/          # Rule parsing and application logic
│   │   ├── parser.ts
│   │   ├── engine.ts
│   │   └── reverser.ts
│   ├── phonotactics/   # Phonotactic constraint parsing and matching
│   │   ├── parser.ts
│   │   └── matcher.ts
│   ├── components/     # Svelte UI components
│   └── types/          # TypeScript type definitions
├── App.svelte          # Main application component
└── main.ts             # Application entry point
```

### Type Definitions

Key types in `src/lib/types/`:

```typescript
interface Rule {
  from: string[];           // Source phoneme sequence (e.g., ['a', 'j'] or ['t', 'h'])
  to: string[];             // Target phoneme sequence (e.g., ['e', 'i'] or [] for deletion)
  leftContext?: string[];   // Optional: context before (e.g., ['t', 'h'] or ['#'] for word boundary)
  rightContext?: string[];  // Optional: context after (e.g., ['c', 'd'] or ['#'] for word boundary)
}

interface TransformResult {
  output: string;
}

interface ReverseResult {
  inputs: string[];
}

interface PhonemeSet {
  phonemes: string[];
}

interface PhonotacticPattern {
  positions: string[][];  // Each position is an array of allowed phonemes
}
```

**Internal Representation**: Rules are stored with array fields to correctly handle multi-phoneme sequences and contexts. The parser converts space-separated strings from the rule syntax into arrays during parsing.

**Phoneme Parsing**: Phoneme files (`.phonemes`) support two formats:
1. **Legacy (flat)**: Space or comma-separated phonemes on a single line (e.g., "a b c" or "a, b, c")
2. **Section-based**: `[inventory]` section for phonemes and optional `[phonotactics]` section for word shape constraints

Both formats support multi-character phonemes like "th", "sh", "ts".

## Technical Notes

- **Svelte 5**: This project uses Svelte 5 with runes (new reactivity system)
- **TypeScript**: Strict mode enabled, prefer explicit types for rule engine logic
- **Vite**: Hot module replacement enabled for fast development iteration
- **Array-Based Rules**: Rule fields (from, to, leftContext, rightContext) are arrays of phonemes, not strings. This correctly handles multi-phoneme sequences and contexts (e.g., `a > b / t h _` where the left context is the two-phoneme sequence "t h")

## Rule Syntax

### Simple Rules

Basic format: `source > target`

- Each rule is on its own line
- Trailing semicolons are accepted but not required
- Whitespace around `>` is optional
- Rules are applied in the order they appear

Examples:
- `a > x` — a becomes x unconditionally
- `h > ∅` — h is deleted (∅ means empty/nothing)
- `th > θ` — multi-character source phoneme

### Context-Sensitive Rules

Format: `source > target / leftContext _ rightContext`

The underscore (`_`) marks where the source phoneme appears. Context notation:
- `#` = word boundary (start or end)
- Any phoneme(s) = must be preceded/followed by that sequence

Examples:
- `w > j / # _` — w becomes j at word beginning
- `t > d / _ #` — t becomes d at word end
- `a > e / b _ c` — a becomes e between b and c
- `k > g / n _` — k becomes g after n

**Important**: Context-sensitive rules only apply when the context matches. Rules are processed sequentially, so context is checked against the current state of the word as each rule is applied.

### Multi-Phoneme Sequences

Format: `phoneme1 phoneme2 > target1 target2`

Both the source and target can be sequences of phonemes (separated by spaces):

**Contraction** (sequence → single):
- `a j > e` — the sequence "aj" becomes "e"
- `a w > o` — the sequence "aw" becomes "o"

**Expansion** (single → sequence):
- `e > a j` — "e" becomes the sequence "aj"

**Identity** (sequence → same sequence):
- `a j > a j` — the sequence "aj" stays as "aj" (useful to block other rules)

**Transformation** (sequence → different sequence):
- `a j > e i` — the sequence "aj" becomes "ei"

**With context**:
- `a j > e / _ #` — "aj" becomes "e" at word end only

**Important**: Multi-phoneme sequences are matched greedily and can be combined with context-sensitive rules.

### Phoneme Classes

Format: `[phoneme1 phoneme2] > target`

Phoneme classes allow you to write compact rules that expand to multiple individual rules at parse time. Classes are denoted by square brackets `[ ]` with space-separated phonemes inside.

**Simple class expansion** (class → single):
- `[a b] > c` — expands to `a > c` and `b > c`
- `[a b c] > x` — expands to `a > x`, `b > x`, and `c > x`

**Paired class mapping** (class → class):
- `[a b] > [x y]` — expands to `a > x` and `b > y` (paired, positional mapping)
- Both classes must have the same length for paired mapping

**Classes in context**:
- `a > b / [c d] _` — expands to `a > b / c _` and `a > b / d _`
- `a > b / _ [e f]` — expands to `a > b / _ e` and `a > b / _ f`
- `a > b / [c d] _ [e f]` — expands to 4 rules (Cartesian product of contexts)

**Multiple classes**:
- `[a b] > [x y] / [c d] _` — expands to 4 rules:
  - `a > x / c _`
  - `a > x / d _`
  - `b > y / c _`
  - `b > y / d _`

**Multi-character phonemes in classes**:
- `[th sh] > [θ ʃ]` — expands to `th > θ` and `sh > ʃ`

**Validation rules**:
- If the target is a class, the source must also be a class
- For paired mapping, both classes must have the same length
- Empty classes `[]` are not allowed

**Optional elements**:
- Use `(X)` to mark an optional context element (present or absent)
- `a > b / (c) _` — expands to two rules:
  - `a > b / c _` (when preceded by c)
  - `a > b / _` (no left context required)
- Multiple independent optionals (Cartesian product): `a > b / (c) _ (d)` → 4 rules
- Nested optionals: `a > b / (c (d)) _` — expands to three rules:
  - `a > b / c d _` (c and d both present)
  - `a > b / c _` (c present, d absent)
  - `a > b / _` (neither required)
- Optional multi-phoneme sequence: `a > b / (c d) _` → 2 rules: `c d` or nothing
- Optional with class inside: `a > b / ([x y]) _` → 3 rules: `x`, `y`, or nothing
- Example use cases:
  - Optional consonants: `V > Vː / _ (C) #` (vowel lengthens before optional consonant at end)
  - Cluster simplification: `C > ∅ / _ (s) t` (consonant deletes before optional s and then t)

**Examples**:
```
# Merge multiple phonemes to one
[p b] > p           # Both p and b become p (devoicing)

# Paired transformation
[p t k] > [b d g]   # p→b, t→d, k→g (voicing)

# Context-sensitive with class
[p t k] > [b d g] / [m n] _   # Voicing after nasals

# Error: target class without source class
a > [x y]           # ERROR: Class in target requires class in source

# Error: mismatched lengths
[a b] > [x y z]     # ERROR: Classes must have same length
```

**Note**: Classes are expanded at parse time, so the Rule Engine and Reverser work with the expanded individual rules. This keeps the core logic simple while providing syntactic convenience.

### Variables

Format: `NAME = value`

Variables allow you to define reusable phonemes, classes, or other variables that can be referenced throughout your ruleset. Variables are defined at the top of the file and are substituted at parse time.

**Basic variable definition**:
```
C = [p t k]       # Define a consonant class
V = [a e i o u]   # Define a vowel class
X = th            # Define a single phoneme
```

**Using variables in rules**:
```
C = [p t k]
V = [a e i]

C > V             # Expands to: p>a, t>e, k>i (paired mapping)
```

**Variables in all positions**:
```
C = [p t]
V = [a e]
N = [m n]

C > V / N _       # Use in source, target, and context
                  # Expands to 4 rules: p>a/m_, p>a/n_, t>e/m_, t>e/n_
```

**Variable references (nested classes)**:
```
VOICELESS = [p t k]
VOICED = [b d g]
STOPS = [VOICELESS VOICED]    # Reference other variables

STOPS > x         # Expands to all stops becoming x
```

**Multi-level references**:
```
A = [x y]
B = A
C = B
C > z             # Works: x>z, y>z
```

**Features**:
- Variables are substituted at parse time
- Variables can contain single phonemes, classes, or references to other variables
- Nested class notation `[VAR1 VAR2]` flattens referenced variables
- No naming restrictions - any token can be a variable name
- Undefined tokens are treated as phonemes (no errors for undefined variables)
- Circular references are detected and reported as errors

**Examples**:
```
# Define phoneme sets
P = [p t k]
F = [f θ s]
VOICELESS = [P F]      # Nested reference

# Use in rules
VOICELESS > ∅          # Delete all voiceless consonants

# Variables with context
V = [a e i]
C = [p t k]
V > V / C _            # Context-sensitive rule

# Paired mapping
STOPS = [p t k]
FRICATIVES = [f θ s]
STOPS > FRICATIVES     # p>f, t>θ, k>s
```

**Validation rules**:
- Circular references like `A = B` and `B = A` will throw an error
- Self-references like `A = A` will throw an error
- All other variable usage follows the same rules as phoneme classes

**Note**: Variables are a syntactic convenience that expand at parse time. The Rule Engine and Reverser work with the fully expanded rules, keeping the core logic simple.

### Negative Sets

Format: `![phoneme1 phoneme2 ...]` - matches any phoneme EXCEPT the listed ones

Negative sets allow you to specify contexts that apply when a phoneme is NOT one of the specified phonemes. They can only be used in contexts (left or right of the `_` placeholder).

**Basic usage**:
```
# a becomes b when NOT after p or t
a > b / ![p t] _

# e becomes i when NOT before m or n
e > i / _ ![m n]

# o becomes u when NOT after s/z AND NOT before r/l
o > u / ![s z] _ ![r l]
```

**With variables**:
```
VOICELESS = [p t k]
VOICED = [b d g]

# Voiceless stops voice when NOT before other voiceless stops
VOICELESS > VOICED / _ ![VOICELESS]
```

**How it works**:
- Negative sets expand at **parse time** based on phonemes mentioned in the ruleset
- `![p t k]` expands to all phonemes in the ruleset EXCEPT p, t, and k
- The "universe" of phonemes is automatically collected from all rules and variables
- This ensures expansion happens once, keeping the engine simple and fast

**Important**: The phoneme universe is inferred from the ruleset itself. To ensure `![p t k]` matches against all relevant phonemes, make sure those phonemes appear somewhere in your ruleset (in variables or rules).

**Examples**:
```
# Declare phoneme inventory (optional but recommended)
C = [p t k b d g]
V = [a e i o u]
SONORANT = [m n r l]

# Voicing before sonorants (NOT before stops)
[p t k] > [b d g] / _ ![C]

# This expands to rules matching contexts: a, e, i, o, u, m, n, r, l
# (all phonemes except p, t, k, b, d, g)
```

**Validation**:
- Empty negative set `![]` expands to all phonemes in the universe
- If a negative set excludes all phonemes, an error is thrown
- Negative sets work with multi-character phonemes: `![th sh]`

**Note**: Negative sets are expanded at parse time like phoneme classes and variables. The Rule Engine and Reverser work with the fully expanded rules.

## Phonemes File Format

There are two distinct file types for phoneme data, both stored in `public/phonemes/`:

### `.phonemes` — Bare Phoneme Inventory

A flat list of space or comma-separated phonemes. No sections, no headers.

```
a aː b d h i iː j k kʼ l m n p r s t w
```

Use this when you only need a phoneme inventory with no phonotactic constraints.

### `.phonotactics` — Full Phonotactic Specification

Variable definitions and pattern lines. No section headers needed. The phoneme inventory
is **derived automatically** from the union of all variable values — no separate inventory
list required.

```
C = [b d h j k kʼ l m n p r s sʼ t tʼ w]
V = [a aː i iː u uː]
G = [j w]

V
CV
CVC
CVGV
CVGVC
```

Special markers `∅` (empty position) and `#` (word boundary) are filtered out when
deriving the phoneme inventory.

**If a `.phonotactics` file exists for a language code, it takes precedence over `.phonemes`.**
The app tries `.phonotactics` first, then falls back to `.phonemes`.

### Phonotactics Syntax

**Variable definitions** (lines with `=`):
- `C = [p t k]` — define a class of phonemes
- `X = th` — define a single phoneme alias
- `STOPS = [VOICELESS VOICED]` — nested variable references (flattened)

**Pattern lines** (lines without `=`):
- Each line defines a valid word shape using variable names and phoneme names
- `CV` — a word must be one consonant followed by one vowel
- `CVC` — consonant-vowel-consonant
- Trailing semicolons are accepted but not required
- Patterns are tokenized using greedy longest-match against variable and phoneme names
- A word is valid if it matches ANY declared pattern (OR logic)
- Spaces between tokens are allowed: `I F T` is equivalent to `IFT`
- Optional elements use `(X)` syntax: `I (M) N` expands to `I M N` and `I N`

**How patterns work**:
- Each position in a pattern expands to the set of allowed phonemes at that position
- `CV` with `C = [p t]; V = [a i];` means: first phoneme must be p or t, second must be a or i
- Literal phonemes can also appear in patterns: `Ca` means first position is C class, second position is literally "a"
- `∅` in a variable means "no phoneme at this position" (e.g., `I = [∅ p t]` allows words with no onset)

**Integration**:
- Forward mode: source word is validated against source phonotactics (throws error if invalid)
- Backward mode: candidate results are filtered to only include words matching source phonotactics
- When no `.phonotactics` file exists and `.phonemes` has no patterns, phonotactics is null (unconstrained)

### Legacy Section-Based Format (still supported for reading)

Files with `[inventory]` and `[phonotactics]` sections are still parsed correctly for
backward compatibility, but new files should use the separate `.phonotactics` format instead.
