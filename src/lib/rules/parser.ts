import type { Rule } from '../types';

/**
 * Parses a string of phonological rules into structured Rule objects
 *
 * Expected formats:
 * - Simple: "a > x;"
 * - With context: "a > x / # _;" (a becomes x at word beginning)
 * - With context: "a > x / _ #;" (a becomes x at word end)
 * - With context: "a > x / b _ c;" (a becomes x between b and c)
 * - With classes: "[a b] > [x y];" (paired mapping: a→x, b→y)
 * - With classes: "[a b] > c;" (both a and b become c)
 * - Classes in context: "a > b / [c d] _;" (expands to two rules)
 * - Comments: "# This is a comment" (lines starting with # are ignored)
 * - Variables: "C = [p t k];" (define a variable)
 * - Variable usage: "C > x;" (use variable in rules)
 * - Variable references: "STOPS = [VOICED VOICELESS];" (nested classes)
 *
 * Context notation:
 * - # = word boundary
 * - _ = position of the target phoneme
 *
 * Class notation:
 * - [a b c] = class containing phonemes a, b, and c
 * - Classes expand at parse time into multiple rules
 * - Nested classes: [a [b c] d] = [a b c d] (flattened)
 *
 * Variable notation:
 * - NAME = value; (define a variable)
 * - Variables can contain single phonemes, classes, or references to other variables
 * - Variables are substituted at parse time
 * - Circular references are detected and reported as errors
 *
 * Comments:
 * - Lines starting with # are treated as comments and ignored
 * - Empty lines are also ignored
 */

/**
 * Flattens nested class notation into array of phonemes
 * Example: "[a [b c] d]" → ["a", "b", "c", "d"]
 * Treats _ as empty marker (will be undefined in result)
 */
function flattenNestedClass(str: string): Array<string | undefined> {
  const trimmed = str.trim();

  // Base case: single phoneme (no brackets)
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    // Treat _ as undefined (empty marker)
    return trimmed === '_' ? [undefined] : [trimmed];
  }

  // Remove outer brackets
  const content = trimmed.slice(1, -1).trim();
  if (content === '') {
    throw new Error('Class cannot be empty: "[]"');
  }

  // Parse tokens handling nested brackets
  const result: Array<string | undefined> = [];
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
      // Space at depth 0: token boundary
      if (current) {
        result.push(...flattenNestedClass(current));
        current = '';
      }
    } else {
      current += char;
    }
  }

  // Don't forget the last token
  if (current) {
    result.push(...flattenNestedClass(current));
  }

  return result;
}

/**
 * Extracts phonemes from a class notation [a b c]
 * Returns null if the string is not a SINGLE class (e.g., multiple classes like "[a] [b]" returns null)
 * Treats _ as undefined (empty marker)
 */
function extractClass(str: string): Array<string | undefined> | null {
  const trimmed = str.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return null;
  }

  // Check if this is a single class or multiple classes
  // Count opening brackets - if more than 1 at depth 0, it's multiple classes
  let depth = 0;
  let classCount = 0;
  for (const char of trimmed) {
    if (char === '[') {
      if (depth === 0) classCount++;
      depth++;
    } else if (char === ']') {
      depth--;
    }
  }

  // If multiple top-level classes, this is not a single class
  if (classCount > 1) {
    return null;
  }

  return flattenNestedClass(trimmed);
}

/**
 * Checks if a class contains the empty marker _
 */
function classContainsEmpty(classContent: string): boolean {
  const phonemes = classContent.split(/\s+/).filter(p => p.length > 0);
  return phonemes.some(p => p.trim() === '_');
}

/**
 * Validates that a context with classes containing _ doesn't create vacuous rules
 * Throws an error if all elements in the context can be simultaneously empty
 */
function validateContextWithEmpty(contextStr: string, contextType: 'left' | 'right', lineNum: number, originalLine: string): void {
  // Find all classes in the context
  const classRegex = /\[([^\]]+)\]/g;
  const matches = Array.from(contextStr.matchAll(classRegex));

  if (matches.length === 0) {
    return; // No classes, nothing to validate
  }

  // Check if all classes contain _
  const classesWithEmpty = matches.filter(m => classContainsEmpty(m[1]));

  if (classesWithEmpty.length === 0) {
    return; // No classes with _, nothing to validate
  }

  // Remove all classes from the string to see if there's any non-class content
  let withoutClasses = contextStr;
  for (const match of matches) {
    withoutClasses = withoutClasses.replace(match[0], '');
  }
  const hasNonClassContent = withoutClasses.trim().length > 0;

  // Check if all classes have _ (can all be empty simultaneously)
  const allClassesHaveEmpty = matches.every(m => classContainsEmpty(m[1]));

  // Error if all classes can be empty AND there's no other content
  if (allClassesHaveEmpty && !hasNonClassContent) {
    const contextName = contextType === 'left' ? 'left context' : 'right context';
    throw new Error(
      `Line ${lineNum}: Vacuous rule - ${contextName} contains only classes with _, ` +
      `which can all be empty simultaneously, making the rule match cases it shouldn't: "${originalLine}"`
    );
  }
}

/**
 * Expands embedded classes in a string (e.g., "x [a b] y" -> ["x a y", "x b y"])
 * Handles _ as a special marker for "nothing" (empty string)
 */
function expandEmbeddedClasses(str: string | undefined): string[] {
  if (!str) return [undefined as any];

  // Find all classes in the string
  const classRegex = /\[([^\]]+)\]/g;
  const matches = Array.from(str.matchAll(classRegex));

  if (matches.length === 0) {
    // No classes found, return as-is
    return [str];
  }

  // Start with the original string
  let results = [str];

  // Process each class match
  for (const match of matches) {
    const fullMatch = match[0]; // e.g., "[a b _]"
    const classContent = match[1]; // e.g., "a b _"

    // Extract phonemes from the class, treating _ as empty marker
    const phonemes = classContent.split(/\s+/).filter(p => p.length > 0).map(p => {
      const trimmed = p.trim();
      return trimmed === '_' ? '' : trimmed;
    });

    // Expand: for each current result, create variants with each phoneme
    const newResults: string[] = [];
    for (const result of results) {
      for (const phoneme of phonemes) {
        // Replace the class with the phoneme
        const expanded = result.replace(fullMatch, phoneme);
        // Clean up extra spaces
        const cleaned = expanded.replace(/\s+/g, ' ').trim();
        newResults.push(cleaned || undefined as any); // undefined for empty context
      }
    }
    results = newResults;
  }

  return results;
}

/**
 * Escapes special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parses a variable definition line
 * Returns { name, value } or null if not a variable definition
 */
function parseVariableDefinition(line: string): { name: string; value: string } | null {
  // Must end with semicolon
  if (!line.endsWith(';')) return null;

  const withoutSemicolon = line.slice(0, -1).trim();

  // Check for '=' sign
  const eqIndex = withoutSemicolon.indexOf('=');
  if (eqIndex === -1) return null;

  // Check that '=' comes before '>' (to avoid matching rules like "a > b;")
  const gtIndex = withoutSemicolon.indexOf('>');
  if (gtIndex !== -1 && gtIndex < eqIndex) return null;

  const name = withoutSemicolon.substring(0, eqIndex).trim();
  const value = withoutSemicolon.substring(eqIndex + 1).trim();

  if (name === '') return null;

  return { name, value };
}

/**
 * Resolves variable references recursively
 * Detects circular references
 */
function resolveVariables(
  definitions: Map<string, string>
): Map<string, string> {
  const resolved = new Map<string, string>();

  function resolve(name: string, visiting: Set<string>): string {
    // Already resolved
    if (resolved.has(name)) {
      return resolved.get(name)!;
    }

    // Circular reference check
    if (visiting.has(name)) {
      throw new Error(`Circular reference in variable: ${name}`);
    }

    const rawValue = definitions.get(name);
    if (!rawValue) {
      // Shouldn't happen if we only call on known variables
      return name;
    }

    // Track current variable to detect cycles
    const newVisiting = new Set(visiting);
    newVisiting.add(name);

    // Substitute variable references in the value
    let substituted = rawValue;

    // For each defined variable, try to substitute it
    for (const varName of definitions.keys()) {
      // Match whole words only (use word boundaries)
      const regex = new RegExp(`\\b${escapeRegex(varName)}\\b`, 'g');

      if (regex.test(substituted)) {
        // Reset regex lastIndex
        regex.lastIndex = 0;

        // Recursively resolve the referenced variable
        const resolvedValue = resolve(varName, newVisiting);
        substituted = substituted.replace(regex, resolvedValue);
      }
    }

    resolved.set(name, substituted);
    return substituted;
  }

  // Resolve all variables
  for (const name of definitions.keys()) {
    resolve(name, new Set());
  }

  return resolved;
}

/**
 * Substitutes variable names with their values in a rule line
 * Handles token boundaries carefully to avoid partial matches
 */
function substituteVariables(
  line: string,
  variables: Map<string, string>
): string {
  let result = line;

  // Sort variables by length (longest first) to avoid partial substitutions
  const sortedVars = Array.from(variables.entries()).sort((a, b) => b[0].length - a[0].length);

  for (const [name, value] of sortedVars) {
    // Token boundaries: space, [, ], >, /, _, ;, start/end of string
    // Match the variable name between delimiters or at string boundaries
    const pattern = `(^|[\\s\\[\\]>/_;])${escapeRegex(name)}(?=[\\s\\[\\]>/_;]|$)`;
    const regex = new RegExp(pattern, 'g');

    // Replace, preserving the leading delimiter but replacing the variable name
    result = result.replace(regex, (match, delimiter) => delimiter + value);
  }

  return result;
}

/**
 * Expands a rule with phoneme classes into multiple concrete rules
 *
 * Expansion rules:
 * - [a b] > c; → a > c; and b > c;
 * - [a b] > [x y]; → a > x; and b > y; (paired, must be same length)
 * - a > [x y]; → ERROR (class in 'to' requires class in 'from')
 * - a > b / [c d] _; → a > b / c _; and a > b / d _; (context expands)
 */
function expandRule(baseRule: { from: string; to: string; leftContext?: string; rightContext?: string }, lineNum: number, originalLine: string): Rule[] {
  const fromClass = extractClass(baseRule.from);
  const toClass = extractClass(baseRule.to);
  const leftContextClass = baseRule.leftContext ? extractClass(baseRule.leftContext) : null;
  const rightContextClass = baseRule.rightContext ? extractClass(baseRule.rightContext) : null;

  // Validate: if 'to' is a class, 'from' must also be a class
  if (toClass && !fromClass) {
    throw new Error(`Line ${lineNum}: Class in target requires class in source: "${originalLine}"`);
  }

  // Validate: if both are classes, they must have the same length (paired mapping)
  if (fromClass && toClass && fromClass.length !== toClass.length) {
    throw new Error(`Line ${lineNum}: Class lengths must match for paired mapping: [${fromClass.join(' ')}] has ${fromClass.length} phonemes, [${toClass.join(' ')}] has ${toClass.length} phonemes`);
  }

  // Determine the base from/to combinations
  let fromToOptions: Array<{ from: string; to: string }>;

  if (fromClass && toClass) {
    // Paired mapping: zip the classes together
    fromToOptions = fromClass.map((f, i) => ({ from: f, to: toClass[i] }));
  } else if (fromClass && !toClass) {
    // Class in from only: each phoneme maps to the same target
    fromToOptions = fromClass.map(f => ({ from: f, to: baseRule.to }));
  } else {
    // No classes in from/to
    fromToOptions = [{ from: baseRule.from, to: baseRule.to }];
  }

  // Determine context combinations
  // First try whole-context classes (legacy), then expand embedded classes
  const leftContextOptions = leftContextClass || expandEmbeddedClasses(baseRule.leftContext);
  const rightContextOptions = rightContextClass || expandEmbeddedClasses(baseRule.rightContext);

  // Generate Cartesian product of all combinations
  const expandedRules: Rule[] = [];

  for (const { from, to } of fromToOptions) {
    for (const leftContext of leftContextOptions) {
      for (const rightContext of rightContextOptions) {
        // Convert strings to arrays of phonemes
        const fromArray = from.split(/\s+/).filter(p => p.length > 0);
        const toArray = to === '' ? [] : to.split(/\s+/).filter(p => p.length > 0);

        // Convert contexts to arrays (undefined stays undefined)
        const leftContextArray = leftContext === undefined
          ? undefined
          : leftContext.split(/\s+/).filter(p => p.length > 0);
        const rightContextArray = rightContext === undefined
          ? undefined
          : rightContext.split(/\s+/).filter(p => p.length > 0);

        expandedRules.push({
          from: fromArray,
          to: toArray,
          leftContext: leftContextArray,
          rightContext: rightContextArray
        });
      }
    }
  }

  return expandedRules;
}
export function parseRules(rulesText: string): Rule[] {
  const lines = rulesText.split('\n');

  // Phase 1: Collect variable definitions
  const variables = new Map<string, string>();
  const ruleLines: { line: string; lineNum: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines and comments
    if (line === '' || line.startsWith('#')) continue;

    // Try to parse as variable definition
    const varDef = parseVariableDefinition(line);
    if (varDef) {
      variables.set(varDef.name, varDef.value);
    } else {
      // It's a rule line
      ruleLines.push({ line, lineNum: i + 1 });
    }
  }

  // Phase 2: Resolve variable references
  const resolvedVars = resolveVariables(variables);

  // Phase 3: Parse rules with variable substitution
  const rules: Rule[] = [];

  for (const { line, lineNum } of ruleLines) {
    // Substitute variables
    const substituted = substituteVariables(line, resolvedVars);

    // Check for semicolon
    if (!substituted.endsWith(';')) {
      throw new Error(`Line ${lineNum}: Rule must end with semicolon: "${line}"`);
    }

    // Remove semicolon
    const rulePart = substituted.slice(0, -1).trim();

    // Check for context (/ separates main rule from context)
    let mainPart: string;
    let contextPart: string | undefined;

    const slashIndex = rulePart.indexOf('/');
    if (slashIndex !== -1) {
      mainPart = rulePart.substring(0, slashIndex).trim();
      contextPart = rulePart.substring(slashIndex + 1).trim();
    } else {
      mainPart = rulePart;
    }

    // Split main part by >
    const parts = mainPart.split('>');

    if (parts.length !== 2) {
      throw new Error(`Line ${lineNum}: Rule must have format "from > to;": "${line}"`);
    }

    const from = parts[0].trim();
    const to = parts[1].trim();

    if (from === '') {
      throw new Error(`Line ${lineNum}: Source pattern cannot be empty`);
    }

    // Parse context if present
    let leftContext: string | undefined;
    let rightContext: string | undefined;

    if (contextPart) {
      // Find the placeholder _ (not inside brackets)
      let underscoreIndex = -1;
      let depth = 0;

      for (let i = 0; i < contextPart.length; i++) {
        const char = contextPart[i];
        if (char === '[') {
          depth++;
        } else if (char === ']') {
          depth--;
        } else if (char === '_' && depth === 0) {
          underscoreIndex = i;
          break;
        }
      }

      if (underscoreIndex === -1) {
        throw new Error(`Line ${lineNum}: Context must contain _ to mark phoneme position: "${line}"`);
      }

      leftContext = contextPart.substring(0, underscoreIndex).trim();
      rightContext = contextPart.substring(underscoreIndex + 1).trim();

      // Validate contexts with empty markers before converting to undefined
      if (leftContext && leftContext !== '') {
        validateContextWithEmpty(leftContext, 'left', lineNum, line);
      }
      if (rightContext && rightContext !== '') {
        validateContextWithEmpty(rightContext, 'right', lineNum, line);
      }

      // Empty string means no context on that side
      if (leftContext === '') leftContext = undefined;
      if (rightContext === '') rightContext = undefined;
    }

    // Expand phoneme classes into multiple rules
    const baseRule = { from, to, leftContext, rightContext };
    const expandedRules = expandRule(baseRule, lineNum, line);
    rules.push(...expandedRules);
  }

  return rules;
}
