# Phonomizer

A web application for applying historical phonological rules to words, both forward and backward.

## What is Phonomizer?

Phonomizer is a tool for linguists, conlangers, and language enthusiasts to model sound changes in languages. It applies phonological rules to transform words and can work in both directions:

- **Forward application**: Given rules and a source word, produce the evolved form
- **Backward application**: Given rules and a target word, find all possible original forms

## Features

**Comprehensive Rule Syntax**
- Simple unconditional rules: `a > e`
- Context-sensitive rules: `t > d / _ #` (word-final)
- Multi-phoneme sequences: `a i > e`
- Deletion: `h > ∅`
- Phoneme classes: `[p t k] > [b d g]`
- Named variables: `STOPS = [p t k]`
- Negative sets: `a > b / ![p t] _` (not after p or t)
- Optional contexts: `a > b / (c) _` (optionally after c)

**Bidirectional Processing**
- Forward: Apply rules to evolve words
- Backward: Reverse-engineer possible source forms

**Phoneme Set Constraints**
- Define valid phoneme inventories for source and target languages
- Prevents combinatorial explosion in backward mode
- Ensures linguistically plausible results

**Phonotactics**
- Declare valid word shapes (e.g., CVC, CV) in `.phonemes` files
- Forward mode validates source words against phonotactic constraints
- Backward mode filters results to only valid word shapes

## Quick Start

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd phonomizer

# Install dependencies
npm install

# Start development server
npm run dev
```

### Basic Usage

1. **Define your phoneme sets** (source and target languages)
2. **Write your rules** using the rule syntax
3. **Enter a word** to transform
4. **Toggle between forward/backward** mode to see results

## Rule Syntax

Rules do not require trailing semicolons (they are accepted but ignored).

### Simple Rules

```
a > e           # a becomes e
th > θ          # multi-character phonemes supported
h > ∅           # deletion (h is removed)
```

### Context-Sensitive Rules

```
# Word boundaries
w > v / # _     # w becomes v at word start
t > d / _ #     # t becomes d at word end

# Phoneme context
k > g / n _     # k becomes g after n
a > e / b _ c   # a becomes e between b and c
```

### Multi-Phoneme Sequences

```
a i > e         # sequence "ai" contracts to "e"
e > a j         # e expands to sequence "aj"
a i > e i       # transform sequence to sequence
```

### Phoneme Classes

```
# Simple expansion
[p b] > p                   # both p and b become p

# Paired mapping (positional)
[p t k] > [b d g]           # p→b, t→d, k→g

# Classes in context
[p t k] > [b d g] / [m n] _ # voicing after nasals
```

### Variables

```
# Define variables
VOICELESS = [p t k]
VOICED = [b d g]
VOWELS = [a e i o u]

# Use in rules
VOICELESS > VOICED          # p→b, t→d, k→g

# Nested references
LABIAL = [p b]
ALVEOLAR = [t d]
ALL_STOPS = [LABIAL ALVEOLAR]
ALL_STOPS > ʔ
```

### Negative Sets

```
# a becomes b when NOT after p or t
a > b / ![p t] _

# e becomes i when NOT before m or n
e > i / _ ![m n]

# Works with variables too
VOICELESS > VOICED / _ ![VOICELESS]
```

Negative sets expand at parse time to all phonemes in the ruleset except the excluded ones.

### Optional Contexts

```
# a becomes b, optionally preceded by c
a > b / (c) _               # expands to: a>b/c_ and a>b/_

# Optional on both sides (Cartesian product)
a > b / (c) _ (d)           # expands to 4 rules

# Nested optional
a > b / (c (d)) _           # expands to 3 rules: cd, c, or nothing

# Optional with class inside
a > b / ([x y]) _           # expands to 3 rules: x, y, or nothing
```

### Comments

```
# Lines starting with # are comments
a > e           # comments must be on their own line
```

## Examples

### Grimm's Law (Simplified)

```
# Proto-Indo-European to Proto-Germanic
VOICELESS = [p t k]
VOICED = [b d g]
ASPIRATED = [bʰ dʰ gʰ]
FRICATIVES = [f θ x]

# First shift: voiceless stops → fricatives
VOICELESS > FRICATIVES

# Second shift: voiced stops → voiceless stops
VOICED > VOICELESS

# Third shift: aspirated stops → voiced stops
ASPIRATED > VOICED
```

### Vowel Changes

```
# Define vowel sets
SHORT_VOWELS = [a e i o u]
LONG_VOWELS = [ā ē ī ō ū]

# Great Vowel Shift (simplified)
ī > aɪ
ē > iː
ā > eɪ
```

## Development

### Commands

```bash
# Development server with hot reload
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Type-check
npm run check

# Build for production
npm run build

# Preview production build
npm run preview

# Generate phoneme files from a ruleset
npm run generate-phonemes public/rules/my-ruleset.phono
```

### Project Structure

```
phonomizer/
├── src/
│   ├── lib/
│   │   ├── rules/          # Rule parsing and application
│   │   │   ├── parser.ts   # Parse rule syntax
│   │   │   ├── engine.ts   # Forward application
│   │   │   └── reverser.ts # Backward application
│   │   ├── phonotactics/   # Phonotactic constraint parsing and matching
│   │   │   ├── parser.ts
│   │   │   └── matcher.ts
│   │   ├── components/     # Svelte UI components
│   │   └── types/          # TypeScript definitions
│   ├── App.svelte          # Main app component
│   └── main.ts             # Entry point
├── public/
│   ├── rules/              # Example rulesets (.phono)
│   └── phonemes/           # Phoneme inventory files (.phonemes)
└── docs/                   # Documentation
```

### Testing

The project has comprehensive test coverage (190+ tests):

- Parser tests: Rule syntax parsing, variables, classes, optional groups, negative sets
- Engine tests: Forward rule application, multi-phoneme sequences, context matching
- Reverser tests: Backward application, deletion reversal, phonotactics filtering
- Phonotactics tests: Pattern parsing and matching

```bash
npm test
```

## Phoneme File Formats

Two file types define phoneme data for a language, stored in `public/phonemes/`:

### `.phonemes` — Bare Inventory

A flat space-separated list of phonemes. No headers, no sections.

```
a b d h i j k l m n p r s t w
```

### `.phonotactics` — Phonotactic Specification

Variables and pattern lines. The phoneme inventory is **derived automatically** from the
variable definitions — no separate inventory list needed. If this file exists for a language,
it takes precedence over the `.phonemes` file.

```
C = [b d h j k l m n p r s t w]
V = [a i]

CV
CVC
V
```

Optional positions use `(X)` syntax, and `∅` in a variable means "no phoneme here":

```
I = [∅ b p m f d t n]   # ∅ = no onset consonant
N = [m n]
V = [a e i o u]

I V (N)     # onset + vowel + optional nasal coda
```

## How It Works

### Forward Application

Rules are applied sequentially to transform source words into target words:

```
Rules: a > e; e > i
Input: "a"
Step 1: a → e
Step 2: e → i
Output: "i"
```

### Backward Application

The reverser works through rules in reverse order, exploring all possible source forms:

```
Rules: a > x; c > x
Target: "xyx"
Possible sources: ["aba", "abc", "cba", "cbc"]
```

Phoneme sets constrain the search space — if "x" is not a valid source phoneme, it must have been transformed by a rule.

## Documentation

- **[CLAUDE.md](CLAUDE.md)** - Complete rule syntax reference and project architecture documentation
- **[docs/implementation-history/](docs/implementation-history/)** - Feature implementation history

## Technologies

- [Svelte 5](https://svelte.dev/) - Reactive UI framework
- [TypeScript](https://www.typescriptlang.org/) - Type-safe JavaScript
- [Vite](https://vitejs.dev/) - Build tool and dev server
- [Vitest](https://vitest.dev/) - Testing framework

---

Built for linguists and language enthusiasts
