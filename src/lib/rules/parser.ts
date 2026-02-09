import type { Rule } from '../types';

/**
 * Parses a string of phonological rules into structured Rule objects
 *
 * Expected formats:
 * - Simple: "a > x;"
 * - With context: "a > x / # _;" (a becomes x at word beginning)
 * - With context: "a > x / _ #;" (a becomes x at word end)
 * - With context: "a > x / b _ c;" (a becomes x between b and c)
 *
 * Context notation:
 * - # = word boundary
 * - _ = position of the target phoneme
 */
export function parseRules(rulesText: string): Rule[] {
  const rules: Rule[] = [];

  // Split by newline and process each line
  const lines = rulesText.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines
    if (line === '') continue;

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

    rules.push({ from, to, leftContext, rightContext });
  }

  return rules;
}
