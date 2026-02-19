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
 * - Optional groups: "a > b / (c) _;" (expands to two rules: with c, without c)
 * - Nested optionals: "a > b / (c (d)) _;" (expands to three rules)
 * - Comments: "# This is a comment" (lines starting with # are ignored)
 * - Variables: "C = [p t k];" (define a variable)
 * - Variable usage: "C > x;" (use variable in rules)
 * - Variable references: "STOPS = [VOICED VOICELESS];" (nested classes)
 *
 * Context notation:
 * - # = word boundary
 * - _ = position of the target phoneme
 * - (X) = optional element X
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
 */
function flattenNestedClass(str: string): string[] {
  const trimmed = str.trim();

  // Base case: single phoneme (no brackets)
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return [trimmed];
  }

  // Remove outer brackets
  const content = trimmed.slice(1, -1).trim();
  if (content === '') {
    throw new Error('Class cannot be empty: "[]"');
  }

  // Parse tokens handling nested brackets
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
 */
function extractClass(str: string): string[] | null {
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
 * Expands embedded classes in a string (e.g., "x [a b] y" -> ["x a y", "x b y"])
 */
function expandEmbeddedClasses(str: string): string[] {
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
    const fullMatch = match[0]; // e.g., "[a b]"
    const classContent = match[1]; // e.g., "a b"

    // Extract phonemes from the class
    const phonemes = classContent.split(/\s+/).filter(p => p.length > 0);

    // Expand: for each current result, create variants with each phoneme
    const newResults: string[] = [];
    for (const result of results) {
      for (const phoneme of phonemes) {
        // Replace the class with the phoneme
        const expanded = result.replace(fullMatch, phoneme);
        // Clean up extra spaces
        const cleaned = expanded.replace(/\s+/g, ' ').trim();
        if (cleaned) newResults.push(cleaned);
      }
    }
    results = newResults;
  }

  return results;
}

/**
 * A parsed segment of a context string
 */
interface Segment {
  type: 'fixed' | 'optional';
  content: string;
}

/**
 * Parses a context string into fixed and optional (parenthesized) segments
 * Example: "c (d) e" → [{type:'fixed',content:'c'}, {type:'optional',content:'d'}, {type:'fixed',content:'e'}]
 */
function parseSegments(context: string): Segment[] {
  const segments: Segment[] = [];
  let i = 0;
  let fixedStart = 0;
  let depth = 0; // tracks [] depth (prevents treating _ inside [] as position marker)

  while (i < context.length) {
    const char = context[i];
    if (char === '[') {
      depth++;
      i++;
    } else if (char === ']') {
      depth--;
      i++;
    } else if (char === '(' && depth === 0) {
      // Flush fixed content before this (
      const fixed = context.substring(fixedStart, i).trim();
      if (fixed) segments.push({ type: 'fixed', content: fixed });

      // Find the matching )
      let innerDepth = 0;
      let j = i + 1;
      while (j < context.length) {
        if (context[j] === '(' || context[j] === '[') {
          innerDepth++;
        } else if (context[j] === ')' || context[j] === ']') {
          if (innerDepth === 0 && context[j] === ')') break;
          innerDepth--;
        }
        j++;
      }

      if (j >= context.length) {
        throw new Error(`Unclosed optional group '(' in context: "${context}"`);
      }

      const innerContent = context.substring(i + 1, j);
      segments.push({ type: 'optional', content: innerContent });

      i = j + 1;
      fixedStart = i;
    } else {
      i++;
    }
  }

  // Flush remaining fixed content
  const remaining = context.substring(fixedStart).trim();
  if (remaining) segments.push({ type: 'fixed', content: remaining });

  return segments;
}

/**
 * Expands optional groups (X) in a context string
 * Returns all variants with/without optional elements
 *
 * Examples:
 * - "(c)" → ["c", undefined]
 * - "c (d) e" → ["c d e", "c e"]
 * - "(c) (d)" → ["c d", "c", "d", undefined]
 * - "(c (d))" → ["c d", "c", undefined]
 */
function expandOptionalGroups(context: string): Array<string | undefined> {
  const segments = parseSegments(context);

  if (segments.length === 0) {
    return [undefined];
  }

  const hasOptional = segments.some(s => s.type === 'optional');
  if (!hasOptional) {
    const joined = segments.map(s => s.content).join(' ').replace(/\s+/g, ' ').trim();
    return [joined || undefined];
  }

  // Generate all combinations (with optional elements before without)
  let combinations: string[][] = [[]];

  for (const segment of segments) {
    if (segment.type === 'fixed') {
      const trimmed = segment.content.trim();
      if (trimmed) {
        combinations = combinations.map(c => [...c, trimmed]);
      }
    } else {
      // Optional: recursively expand inner content
      const innerVariants = expandOptionalGroups(segment.content)
        .filter((v): v is string => v !== undefined && v.trim() !== '');

      const newCombinations: string[][] = [];
      for (const combo of combinations) {
        // With each inner variant (present first)
        for (const inner of innerVariants) {
          newCombinations.push([...combo, inner]);
        }
        // Without this optional group (absent)
        newCombinations.push([...combo]);
      }
      combinations = newCombinations;
    }
  }

  // Convert to strings, deduplicating
  const seen = new Set<string>();
  const results: Array<string | undefined> = [];

  for (const parts of combinations) {
    const joined = parts.filter(p => p.trim()).join(' ').replace(/\s+/g, ' ').trim();
    if (!seen.has(joined)) {
      seen.add(joined);
      results.push(joined || undefined);
    }
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
  // Strip optional trailing semicolon
  const withoutSemicolon = line.endsWith(';') ? line.slice(0, -1).trim() : line.trim();

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
 * - a > b / (c) _; → a > b / c _; and a > b / _; (optional group expands)
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

  // Determine left context options
  // If the entire context is a single class [a b], use class expansion (legacy)
  // Otherwise, expand optional groups first, then any embedded classes
  let leftContextOptions: Array<string | undefined>;
  if (leftContextClass) {
    leftContextOptions = leftContextClass;
  } else {
    const optVariants = expandOptionalGroups(baseRule.leftContext ?? '');
    leftContextOptions = optVariants.flatMap(v =>
      v === undefined ? [undefined] as Array<string | undefined> : expandEmbeddedClasses(v)
    );
  }

  // Determine right context options
  let rightContextOptions: Array<string | undefined>;
  if (rightContextClass) {
    rightContextOptions = rightContextClass;
  } else {
    const optVariants = expandOptionalGroups(baseRule.rightContext ?? '');
    rightContextOptions = optVariants.flatMap(v =>
      v === undefined ? [undefined] as Array<string | undefined> : expandEmbeddedClasses(v)
    );
  }

  // Generate Cartesian product of all combinations
  const expandedRules: Rule[] = [];

  for (const { from, to } of fromToOptions) {
    for (const leftContext of leftContextOptions) {
      for (const rightContext of rightContextOptions) {
        // Convert strings to arrays of phonemes
        // ∅ in the target position means deletion (same as empty target)
        const fromArray = from.split(/\s+/).filter(p => p.length > 0);
        const toArray = (to === '' || to.trim() === '∅') ? [] : to.split(/\s+/).filter(p => p.length > 0);

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
          leftContext: leftContextArray && leftContextArray.length > 0 ? leftContextArray : undefined,
          rightContext: rightContextArray && rightContextArray.length > 0 ? rightContextArray : undefined
        });
      }
    }
  }

  return expandedRules;
}

/**
 * Collects all phonemes mentioned in the ruleset
 * This is used as the "universe" for expanding negative sets
 */
function collectAllPhonemes(
  variables: Map<string, string>,
  ruleLines: string[]
): Set<string> {
  const phonemes = new Set<string>();

  // Extract phonemes from a string (handles classes and space-separated lists)
  function extractPhonemes(str: string): void {
    // Remove brackets to get the content
    const withoutBrackets = str.replace(/\[|\]/g, ' ');
    // Split by spaces and filter out empty strings and special markers
    const tokens = withoutBrackets.split(/\s+/).filter(t =>
      t && t !== '_' && t !== '#' && t !== '!' && t !== '∅' && !t.startsWith('!')
    );
    tokens.forEach(t => phonemes.add(t));
  }

  // Collect from variables
  for (const value of variables.values()) {
    extractPhonemes(value);
  }

  // Collect from rule lines
  for (const line of ruleLines) {
    // Remove semicolon and split by / to get main part and context
    const withoutSemicolon = line.replace(';', '');
    const parts = withoutSemicolon.split('/');

    // Extract from main part (from > to)
    const mainPart = parts[0] || '';
    const [from, to] = mainPart.split('>').map(s => s.trim());
    if (from) extractPhonemes(from);
    if (to) extractPhonemes(to);

    // Extract from context (if present)
    if (parts[1]) {
      extractPhonemes(parts[1]);
    }
  }

  return phonemes;
}

/**
 * Expands a negative set ![a b c] to a positive set containing all phonemes except a, b, c
 */
function expandNegativeSet(negativeSet: string, universe: Set<string>): string {
  // Extract the content of the negative set (remove ![ and ])
  const content = negativeSet.slice(2, -1).trim();

  if (content === '') {
    // ![  ] (empty negative set) expands to all phonemes
    return `[${Array.from(universe).join(' ')}]`;
  }

  // Get the phonemes to exclude
  // Use flattenNestedClass to handle cases like ![[p t k]] (from variable substitution)
  const toExclude = new Set(flattenNestedClass(`[${content}]`));

  // Compute the complement
  const complement = Array.from(universe).filter(p => !toExclude.has(p));

  if (complement.length === 0) {
    throw new Error(`Negative set ${negativeSet} excludes all phonemes - no phonemes left`);
  }

  return `[${complement.join(' ')}]`;
}

/**
 * Expands negative sets in a string by replacing ![...] with [...complement...]
 */
function expandNegativeSets(str: string, universe: Set<string>): string {
  // Find all negative sets: ![...]
  // Need to handle nested brackets carefully
  let result = str;

  while (true) {
    // Find the next ![
    const bangBracketIndex = result.indexOf('![');
    if (bangBracketIndex === -1) break;

    // Find the matching ]
    // Start after the ![ (at position bangBracketIndex + 2)
    let depth = 0;
    let endIndex = -1;

    for (let i = bangBracketIndex + 2; i < result.length; i++) {
      if (result[i] === '[') {
        depth++;
      } else if (result[i] === ']') {
        if (depth === 0) {
          endIndex = i;
          break;
        }
        depth--;
      }
    }

    if (endIndex === -1) {
      throw new Error(`Unclosed negative set starting at position ${bangBracketIndex}`);
    }

    // Extract the negative set
    const negativeSet = result.substring(bangBracketIndex, endIndex + 1);

    // Expand it
    const expanded = expandNegativeSet(negativeSet, universe);

    // Replace in the result
    result = result.substring(0, bangBracketIndex) + expanded + result.substring(endIndex + 1);
  }

  return result;
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

  // Phase 3: Collect all phonemes (for negative set expansion)
  const substitutedLines = ruleLines.map(({ line }) =>
    substituteVariables(line, resolvedVars)
  );
  const allPhonemes = collectAllPhonemes(resolvedVars, substitutedLines);

  // Phase 4: Parse rules with variable substitution and negative set expansion
  const rules: Rule[] = [];

  for (const { line, lineNum } of ruleLines) {
    // Substitute variables
    let substituted = substituteVariables(line, resolvedVars);

    // Expand negative sets
    substituted = expandNegativeSets(substituted, allPhonemes);

    // Strip optional trailing semicolon
    const rulePart = substituted.endsWith(';') ? substituted.slice(0, -1).trim() : substituted.trim();

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
      // Find the placeholder _ (not inside brackets or parentheses)
      let underscoreIndex = -1;
      let depth = 0;

      for (let i = 0; i < contextPart.length; i++) {
        const char = contextPart[i];
        if (char === '[' || char === '(') {
          depth++;
        } else if (char === ']' || char === ')') {
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
