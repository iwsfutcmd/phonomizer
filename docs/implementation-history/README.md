# Implementation History Archive

This directory contains historical documentation from feature implementations. These documents capture the planning, implementation details, and testing notes from major features added to Phonomizer.

## Documents

### Phoneme Classes Feature (2024)

- **`PHONEME_CLASSES.md`** - Detailed documentation of the phoneme classes feature
- **`IMPLEMENTATION_SUMMARY.md`** - Summary of how phoneme classes were implemented
- **`test-phoneme-classes.md`** - Manual testing notes and test cases

**What it does:** Allows compact rule notation like `[p t k] > [b d g];` which expands to paired mappings at parse time.

### Variables Feature (2024)

- **`VARIABLES_PLAN.md`** - Original implementation plan for the variables feature
- **`VARIABLES_IMPLEMENTATION.md`** - Complete implementation summary with examples and test coverage

**What it does:** Enables named variables for phonemes and classes (e.g., `STOPS = [p t k];`) with support for nested references and recursive resolution.

## Current Documentation

For current, up-to-date documentation, see:
- **`/CLAUDE.md`** - Main project documentation with complete rule syntax reference
- **`/README.md`** - Project README (to be updated)

## Notes

These documents are kept for historical reference and to understand the evolution of the parser. All current syntax and features are documented in `CLAUDE.md`.
