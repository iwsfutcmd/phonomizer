# Variables Implementation Summary

## Overview

Successfully implemented named variables for the Phonomizer rule parser. Variables allow defining reusable phonemes, classes, and nested references that are substituted at parse time.

## Features Implemented

### 1. Variable Definitions
```
C = [p t k];           # Phoneme class
V = a;                 # Single phoneme
STOPS = [VOICED VOICELESS];  # Variable references
```

### 2. Variable Substitution
- Parse-time substitution (no runtime overhead)
- Works in all rule positions: source, target, and context
- Supports nested class notation for variable references

### 3. Variable References
```
VOICELESS = [p t k];
VOICED = [b d g];
STOPS = [VOICELESS VOICED];   # Flattens to [p t k b d g]
```

### 4. Circular Reference Detection
```
A = B;
B = A;    # ERROR: Circular reference in variable: A
```

## Implementation Details

### New Helper Functions (parser.ts)

1. **`flattenNestedClass()`** - Recursively flattens nested class notation
2. **`escapeRegex()`** - Escapes special regex characters in variable names
3. **`parseVariableDefinition()`** - Detects and parses variable definitions
4. **`resolveVariables()`** - Recursively resolves variable references
5. **`substituteVariables()`** - Replaces variable names with their values

### Modified Functions

**`extractClass()`** - Now uses `flattenNestedClass()` to support nested classes

**`parseRules()`** - Implements three-phase parsing:
1. Collect variable definitions
2. Resolve variable references (detect cycles)
3. Parse rules with variable substitution

## Test Coverage

Added 24 comprehensive tests covering:
- ✅ Simple variable definition and usage
- ✅ Single phoneme variables
- ✅ Variables in target position (error validation)
- ✅ Variables in context
- ✅ Variable references (nested classes)
- ✅ Deeply nested variable references
- ✅ Circular reference detection
- ✅ Self-referential variables
- ✅ Multi-character phonemes in variables
- ✅ Paired class mapping with variables
- ✅ Undefined tokens treated as phonemes
- ✅ Variable names that look like phonemes
- ✅ Deletion rules with variables
- ✅ Comments mixed with variables
- ✅ Variables in all rule positions
- ✅ Nested classes without variables
- ✅ Complex nested structures
- ✅ Variables vs rule syntax disambiguation
- ✅ Variables with special regex characters

### Test Results
```
✓ 90 tests passed (24 new variable tests)
✓ All existing tests still pass
✓ Backward compatible with existing rulesets
```

## Syntax Examples

### Basic Usage
```
C = [p t k];
C > x;
# Expands to: p>x, t>x, k>x
```

### Paired Mapping
```
STOPS = [p t k];
FRICATIVES = [f θ s];
STOPS > FRICATIVES;
# Expands to: p>f, t>θ, k>s
```

### Context-Sensitive
```
C = [p t];
V = [a e];
N = [m n];
C > V / N _;
# Expands to 4 rules: p>a/m_, p>a/n_, t>e/m_, t>e/n_
```

### Nested References
```
VOICELESS = [p t k];
VOICED = [b d g];
STOPS = [VOICELESS VOICED];
STOPS > ;
# Delete all stops
```

## Documentation

Updated CLAUDE.md with comprehensive Variables section including:
- Syntax and format
- Usage examples
- Variable references and nesting
- Validation rules
- Feature list

## Files Modified

1. **src/lib/rules/parser.ts** - Core implementation (+120 lines)
2. **src/lib/rules/parser.test.ts** - Test coverage (+140 lines)
3. **CLAUDE.md** - Documentation (+80 lines)

## Backward Compatibility

✅ Fully backward compatible
- All existing rulesets parse correctly
- No changes to core Rule type
- No changes to engine or reverser
- Existing 66 tests continue to pass

## Performance

- Variables are expanded at parse time (one-time cost)
- No runtime performance impact
- Engine and reverser unchanged

## Edge Cases Handled

1. ✅ Empty variable values (for deletion)
2. ✅ Variable names with special characters
3. ✅ Variables that look like phonemes
4. ✅ Comments mixed with variables
5. ✅ Multi-character phonemes in variables
6. ✅ Deeply nested references
7. ✅ Circular reference detection

## Design Decisions

### Parse-Time Expansion Strategy
Chose to expand variables at parse time rather than runtime because:
- Keeps core types (Rule) unchanged
- No changes needed to engine or reverser
- Easier debugging (all rules are explicit)
- Minimal performance impact
- All existing tests continue to pass

### No Undefined Variable Errors
Variables follow "optional substitution" semantics:
- If token matches a variable, substitute it
- Otherwise, treat it as a phoneme
- This makes the syntax more forgiving and flexible

### Circular Reference Detection
Implemented recursive resolution with cycle detection to prevent infinite loops and provide clear error messages.

## Future Enhancements (Not Implemented)

Potential future additions:
- Variable scoping
- Variable interpolation in strings
- Computed variables
- Variable namespaces

These were not implemented to keep the initial release simple and focused.
