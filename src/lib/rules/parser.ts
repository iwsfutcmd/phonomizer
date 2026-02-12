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
 *
 * Context notation:
 * - # = word boundary
 * - _ = position of the target phoneme
 *
 * Class notation:
 * - [a b c] = class containing phonemes a, b, and c
 * - Classes expand at parse time into multiple rules
 *
 * Comments:
 * - Lines starting with # are treated as comments and ignored
 * - Empty lines are also ignored
 */

/**
 * Extracts phonemes from a class notation [a b c]
 * Returns null if the string is not a class
 */
function extractClass(str: string): string[] | null {
  const trimmed = str.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return null;
  }

  const content = trimmed.slice(1, -1).trim();
  if (content === '') {
    throw new Error('Class cannot be empty: "[]"');
  }

  // Split by whitespace to get individual phonemes
  return content.split(/\s+/);
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
  const leftContextOptions = leftContextClass || (baseRule.leftContext !== undefined ? [baseRule.leftContext] : [undefined]);
  const rightContextOptions = rightContextClass || (baseRule.rightContext !== undefined ? [baseRule.rightContext] : [undefined]);

  // Generate Cartesian product of all combinations
  const expandedRules: Rule[] = [];

  for (const { from, to } of fromToOptions) {
    for (const leftContext of leftContextOptions) {
      for (const rightContext of rightContextOptions) {
        expandedRules.push({
          from,
          to,
          leftContext,
          rightContext
        });
      }
    }
  }

  return expandedRules;
}
export function parseRules(rulesText: string): Rule[] {
  const rules: Rule[] = [];

  // Split by newline and process each line
  const lines = rulesText.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines and comments
    if (line === '' || line.startsWith('#')) continue;

    // Check for semicolon
    if (!line.endsWith(';')) {
      throw new Error(`Line ${i + 1}: Rule must end with semicolon: "${line}"`);
    }

    // Remove semicolon
    const rulePart = line.slice(0, -1).trim();

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
      throw new Error(`Line ${i + 1}: Rule must have format "from > to;": "${line}"`);
    }

    const from = parts[0].trim();
    const to = parts[1].trim();

    if (from === '') {
      throw new Error(`Line ${i + 1}: Source pattern cannot be empty`);
    }

    // Parse context if present
    let leftContext: string | undefined;
    let rightContext: string | undefined;

    if (contextPart) {
      const underscoreIndex = contextPart.indexOf('_');
      if (underscoreIndex === -1) {
        throw new Error(`Line ${i + 1}: Context must contain _ to mark phoneme position: "${line}"`);
      }

      leftContext = contextPart.substring(0, underscoreIndex).trim();
      rightContext = contextPart.substring(underscoreIndex + 1).trim();

      // Empty string means no context on that side
      if (leftContext === '') leftContext = undefined;
      if (rightContext === '') rightContext = undefined;
    }

    // Expand phoneme classes into multiple rules
    const baseRule = { from, to, leftContext, rightContext };
    const expandedRules = expandRule(baseRule, i + 1, line);
    rules.push(...expandedRules);
  }

  return rules;
}
