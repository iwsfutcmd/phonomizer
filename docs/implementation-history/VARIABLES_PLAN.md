# Variables Implementation Plan

## Overview
Add support for named variables that can represent phonemes or phoneme classes.

## Syntax

### Variable Definition
```
C = [a b c];
V = [a e i o u];
X = th;              # Single phoneme
```

### Variable Usage
```
C > x;               # Use in 'from'
a > V;               # Use in 'to'
C > x / V _;         # Use in context
V > V / C _ C;       # Use everywhere
```

### Variable References
```
VOICELESS_STOPS = [p t k];
VOICED_STOPS = [b d g];
STOPS = [VOICELESS_STOPS VOICED_STOPS];  # Nested classes
```

### Nested Classes
To support variable references, we need nested class syntax:
```
[[a b] [c d]] > e;   # Flattens to [a b c d] > e;
```

## Semantics

1. **No naming restrictions**: Any token can be a variable name
2. **Resolution**: If a token is defined as a variable, use it; else treat as phoneme
3. **Validation**: Error if variable name appears in phoneme set (conflicts)
4. **Variable references**: Variables can reference other variables
5. **Ordering**: Variables must be defined before rules (top of file)
6. **Error handling**: Undefined variable usage → error, circular references → error

## Implementation Strategy

### 1. Two-Phase Parsing

**Phase 1: Parse variable definitions**
- Scan for lines matching `NAME = VALUE;`
- Store in `Map<string, string>` (raw values, not yet resolved)
- Everything else goes to rules list

**Phase 2: Resolve variables**
- For each variable, recursively resolve references
- Detect circular references
- Store resolved values

**Phase 3: Parse rules**
- Substitute variable names with values
- Expand classes (existing logic)

### 2. Nested Class Support

**Update `extractClass()`** to handle nested brackets:

```
flattenNestedClass(str):
  # Parse "[a b [c d] e]" → ["a", "b", "c", "d", "e"]
  1. Remove outer brackets
  2. Parse tokens handling nested depth
  3. Recursively flatten nested classes
  4. Return flat array
```

Algorithm:
```typescript
function flattenNestedClass(str: string): string[] {
  const trimmed = str.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return [trimmed]; // Single phoneme
  }

  const content = trimmed.slice(1, -1).trim();
  const result: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of content) {
    if (char === '[') {
      depth++;
      current += char;
    } else if (char === ']') {
      depth--;
      current += char;
    } else if (/\s/.test(char) && depth === 0) {
      if (current) {
        result.push(...flattenNestedClass(current));
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current) {
    result.push(...flattenNestedClass(current));
  }

  return result;
}
```

### 3. Variable Resolution

```typescript
function resolveVariables(
  definitions: Map<string, string>
): Map<string, string> {
  const resolved = new Map<string, string>();
  const visiting = new Set<string>();

  function resolve(name: string): string {
    if (resolved.has(name)) {
      return resolved.get(name)!;
    }

    if (visiting.has(name)) {
      throw new Error(`Circular reference in variable: ${name}`);
    }

    visiting.add(name);
    const rawValue = definitions.get(name)!;

    // Substitute variable references in the value
    let substituted = rawValue;
    for (const [varName, _] of definitions) {
      // Replace variable tokens with their resolved values
      const regex = new RegExp(`\\b${varName}\\b`, 'g');
      if (regex.test(substituted)) {
        const resolvedValue = resolve(varName);
        substituted = substituted.replace(regex, resolvedValue);
      }
    }

    resolved.set(name, substituted);
    visiting.delete(name);
    return substituted;
  }

  for (const name of definitions.keys()) {
    resolve(name);
  }

  return resolved;
}
```

### 4. Variable Substitution in Rules

Before expanding classes, substitute variables:

```typescript
function substituteVariables(
  ruleText: string,
  variables: Map<string, string>
): string {
  let result = ruleText;

  for (const [name, value] of variables) {
    // Replace whole tokens only (word boundaries)
    const regex = new RegExp(`\\b${name}\\b`, 'g');
    result = result.replace(regex, value);
  }

  return result;
}
```

### 5. Update parseRules()

```typescript
export function parseRules(rulesText: string): Rule[] {
  const lines = rulesText.split('\n');
  const variables = new Map<string, string>();
  const ruleLines: string[] = [];

  // Phase 1: Collect variable definitions
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const varDef = parseVariableDefinition(trimmed);
    if (varDef) {
      variables.set(varDef.name, varDef.value);
    } else {
      ruleLines.push(trimmed);
    }
  }

  // Phase 2: Resolve variable references
  const resolvedVars = resolveVariables(variables);

  // Phase 3: Parse rules with variable substitution
  const rules: Rule[] = [];
  for (let i = 0; i < ruleLines.length; i++) {
    const line = ruleLines[i];
    const substituted = substituteVariables(line, resolvedVars);
    // ... existing parsing logic with substituted line
  }

  return rules;
}
```

## Files to Modify

1. **`src/lib/rules/parser.ts`**
   - Add `parseVariableDefinition()`
   - Add `flattenNestedClass()`
   - Add `resolveVariables()`
   - Add `substituteVariables()`
   - Update `extractClass()` to use `flattenNestedClass()`
   - Update `parseRules()` for two-phase parsing

2. **`src/lib/rules/parser.test.ts`**
   - Tests for variable definitions
   - Tests for variable substitution
   - Tests for nested classes
   - Tests for variable references
   - Tests for circular reference detection
   - Tests for undefined variable errors

3. **`CLAUDE.md`**
   - Document variable syntax

## Test Cases

### Basic Variables
```
V = [a e i];
V > x;  # Should expand to [a e i] > x;
```

### Variable References
```
V1 = [a e];
V2 = [i o];
V = [V1 V2];
V > x;  # Should expand to [a e i o] > x;
```

### Nested Classes
```
[[a b] [c d]] > x;  # Should expand to [a b c d] > x;
```

### Error Cases
```
# Undefined variable
C > x;  # ERROR: Variable C not defined

# Circular reference
A = [B];
B = [A];  # ERROR: Circular reference

# Variable used in invalid position (caught by existing validation)
C = [a b];
d > C;  # ERROR: Class in target requires class in source
```

## Validation

**Phoneme set conflict detection** (future):
- When phoneme sets are provided, check if any variable names conflict
- This might require passing phoneme sets to the parser
- Or validate at application time

## Examples

### Example 1: Simple Variables
```
C = [p t k];
V = [a e i];

C > x / V _;
```

Expands to same as:
```
[p t k] > x / [a e i] _;
```

### Example 2: Complex Ruleset
```
# Define phoneme classes
VOICELESS_STOPS = [p t k];
VOICED_STOPS = [b d g];
STOPS = [VOICELESS_STOPS VOICED_STOPS];
NASALS = [m n];

# Voicing after nasals
VOICELESS_STOPS > VOICED_STOPS / NASALS _;

# Stop deletion word-finally
STOPS > / _ #;
```

## Benefits

1. **Readability**: Semantic names instead of phoneme lists
2. **Maintainability**: Update class once, affects all rules
3. **Reusability**: Define common classes at the top
4. **Documentation**: Variable names document phonological categories

## Implementation Order

1. Parse variable definitions (simple cases)
2. Variable substitution in rules
3. Nested class support
4. Variable references (recursive resolution)
5. Circular reference detection
6. Comprehensive tests
7. Documentation

## Backward Compatibility

Fully backward compatible - existing rulesets without variables continue to work.
