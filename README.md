# Phonomizer

A powerful web application for applying historical phonological rules to words, both forward and backward.

## What is Phonomizer?

Phonomizer is a tool for linguists, conlangers, and language enthusiasts to model sound changes in languages. It applies phonological rules to transform words and can work in both directions:

- **Forward application**: Given rules and a source word, produce the evolved form
- **Backward application**: Given rules and a target word, find all possible original forms

## Features

✨ **Comprehensive Rule Syntax**
- Simple unconditional rules: `a > e;`
- Context-sensitive rules: `t > d / _ #;` (word-final)
- Multi-phoneme sequences: `a i > e;`
- Phoneme classes: `[p t k] > [b d g];`
- Named variables: `STOPS = [p t k];`
- Nested variable references

🔄 **Bidirectional Processing**
- Forward: Apply rules to evolve words
- Backward: Reverse-engineer possible source forms

🎯 **Phoneme Set Constraints**
- Define valid phoneme inventories for source and target languages
- Prevents combinatorial explosion in backward mode
- Ensures linguistically plausible results

🚀 **Modern Tech Stack**
- Built with Svelte 5 and TypeScript
- Fast, responsive UI with hot module replacement
- Comprehensive test coverage (90+ tests)

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

### Simple Rules

```
a > e;          # a becomes e
th > θ;         # multi-character phonemes supported
x > ;           # deletion (empty target)
```

### Context-Sensitive Rules

```
# Word boundaries
w > v / # _;    # w becomes v at word start
t > d / _ #;    # t becomes d at word end

# Phoneme context
k > g / n _;    # k becomes g after n
a > e / b _ c;  # a becomes e between b and c
```

### Multi-Phoneme Sequences

```
a i > e;        # sequence "ai" contracts to "e"
e > a j;        # e expands to sequence "aj"
a i > e i;      # transform sequence to sequence
```

### Phoneme Classes

```
# Simple expansion
[p b] > p;                  # both p and b become p

# Paired mapping (positional)
[p t k] > [b d g];          # p→b, t→d, k→g

# Classes in context
[p t k] > [b d g] / [m n] _;  # voicing after nasals
```

### Variables

```
# Define variables
VOICELESS_STOPS = [p t k];
VOICED_STOPS = [b d g];
VOWELS = [a e i o u];

# Use in rules
VOICELESS_STOPS > VOICED_STOPS;  # p→b, t→d, k→g

# Nested references
LABIAL = [p b];
ALVEOLAR = [t d];
ALL_STOPS = [LABIAL ALVEOLAR];
ALL_STOPS > ʔ;
```

### Comments

```
# Lines starting with # are comments
# They are ignored by the parser

a > e;  # Comments must be on their own line
```

## Examples

### Grimm's Law (Simplified)

```
# Proto-Indo-European to Proto-Germanic
VOICELESS = [p t k];
VOICED = [b d g];
ASPIRATED = [bʰ dʰ gʰ];
FRICATIVES = [f θ x];

# First shift: voiceless stops → fricatives
VOICELESS > FRICATIVES;

# Second shift: voiced stops → voiceless stops
VOICED > VOICELESS;

# Third shift: aspirated stops → voiced stops
ASPIRATED > VOICED;
```

### Vowel Changes

```
# Define vowel sets
SHORT_VOWELS = [a e i o u];
LONG_VOWELS = [ā ē ī ō ū];

# Great Vowel Shift (simplified)
ī > aɪ;
ē > iː;
ā > eɪ;
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
│   │   ├── components/     # Svelte UI components
│   │   └── types/          # TypeScript definitions
│   ├── App.svelte          # Main app component
│   └── main.ts             # Entry point
├── public/
│   └── rules/              # Example rulesets
├── docs/                   # Documentation
└── tests/                  # Test files
```

### Testing

The project has comprehensive test coverage:

- Parser tests: Rule syntax parsing, variables, classes
- Engine tests: Forward rule application
- Reverser tests: Backward rule application

```bash
# Run all tests
npm test

# Watch mode for development
npm run test:watch
```

## Documentation

- **[CLAUDE.md](CLAUDE.md)** - Complete rule syntax reference and project documentation
- **[docs/implementation-history/](docs/implementation-history/)** - Feature implementation history

## How It Works

### Forward Application

Rules are applied sequentially to transform source words into target words:

```
Rules: a > e; e > i;
Input: "a"
Step 1: a → e
Step 2: e → i
Output: "i"
```

### Backward Application

The reverser works through rules in reverse order, exploring all possible source forms:

```
Rules: a > x; c > x;
Target: "xyx"
Possible sources: ["aya", "ayc", "cya", "cyc"]
```

Phoneme sets constrain the search space - if "x" is not a valid source phoneme, we know it must have been transformed by a rule.

## Contributing

Contributions are welcome! Please:

1. Run tests before submitting: `npm test`
2. Follow the existing code style
3. Add tests for new features
4. Update documentation as needed

## License

[Add your license here]

## Technologies

- [Svelte 5](https://svelte.dev/) - Reactive UI framework
- [TypeScript](https://www.typescriptlang.org/) - Type-safe JavaScript
- [Vite](https://vitejs.dev/) - Build tool and dev server
- [Vitest](https://vitest.dev/) - Testing framework

---

Built with ❤️ for linguists and language enthusiasts
