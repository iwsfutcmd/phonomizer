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
Rules: a > x; b > y; c > x;
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

## Architecture

### Core Components

**Rule Engine** (`src/lib/rules/`)
- `parser.ts`: Parses rule syntax (e.g., "a > x;") into structured rule objects
- `engine.ts`: Applies rules forward (source → target)
- `reverser.ts`: Applies rules backward (target → all possible sources)

**Rule Application Logic**:
- Rules are applied sequentially in order
- Each rule transforms the entire string before the next rule is applied
- Forward application is deterministic (one source → one target)
- Backward application is non-deterministic (one target → multiple possible sources)

**Key Algorithm Considerations**:
- Forward: Simple string replacement/pattern matching for each rule. Validates that source word uses only source phonemes and rules map between valid phoneme sets.
- Backward: Works through rules in reverse order. For each rule "a > x", every "x" in the current word could be:
  - Replaced with "a" (reverse the rule)
  - Left as "x" (only if "x" is in the source phoneme set - meaning it wasn't transformed by this rule)
- Phoneme sets prevent explosion: Without phoneme sets, "xyx" with rules "a>x, c>x" generates 2³ = 8 combinations. With phoneme sets where "x" is not in the source set, we must replace all "x"s, giving only 4 valid results.
- Uses greedy longest-match for multi-character phonemes (e.g., "th", "sh")

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
│   ├── components/     # Svelte UI components
│   └── types/          # TypeScript type definitions
├── App.svelte          # Main application component
└── main.ts             # Application entry point
```

### Type Definitions

Key types in `src/lib/types/`:

```typescript
interface Rule {
  from: string;            // Source phoneme/pattern
  to: string;              // Target phoneme/pattern
  leftContext?: string;    // Optional: context before (# = word boundary)
  rightContext?: string;   // Optional: context after (# = word boundary)
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
```

**Phoneme Parsing**: Phonemes are entered as space or comma-separated strings (e.g., "a b c" or "a, b, c"). Supports multi-character phonemes like "th", "sh", "ts".

## Technical Notes

- **Svelte 5**: This project uses Svelte 5 with runes (new reactivity system)
- **TypeScript**: Strict mode enabled, prefer explicit types for rule engine logic
- **Vite**: Hot module replacement enabled for fast development iteration

## Rule Syntax

### Simple Rules

Basic format: `source > target;`

- Each rule is on its own line
- Rules end with semicolon
- Whitespace around `>` is optional
- Rules are applied in the order they appear

Example: `a > x;` (a becomes x unconditionally)

### Context-Sensitive Rules

Format: `source > target / leftContext _ rightContext;`

The underscore (`_`) marks where the phoneme appears. Context notation:
- `#` = word boundary (start or end)
- Any phoneme(s) = must be preceded/followed by that sequence

Examples:
- `w > j / # _;` — w becomes j at word beginning
- `t > d / _ #;` — t becomes d at word end
- `a > e / b _ c;` — a becomes e between b and c
- `k > g / n _;` — k becomes g after n

**Important**: Context-sensitive rules only apply when the context matches. Rules are processed sequentially, so context is checked against the current state of the word as each rule is applied.
