#!/usr/bin/env node

/**
 * Utility to generate phoneme files from ruleset files
 *
 * Usage: node scripts/generate-phonemes.js <ruleset-file>
 * Example: node scripts/generate-phonemes.js public/rules/sem-pro_arb.phono
 */

import { readFileSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';

function parseRuleset(rulesetPath) {
  const content = readFileSync(rulesetPath, 'utf-8');
  const lines = content.split('\n');

  const sourcePhonemes = new Set();
  const targetPhonemes = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.endsWith(';')) continue;

    // Remove semicolon
    const rulePart = trimmed.slice(0, -1).trim();

    // Check for context (/ separates main rule from context)
    let mainPart;
    const slashIndex = rulePart.indexOf('/');
    if (slashIndex !== -1) {
      mainPart = rulePart.substring(0, slashIndex).trim();
    } else {
      mainPart = rulePart;
    }

    // Split by >
    const parts = mainPart.split('>');
    if (parts.length !== 2) continue;

    const from = parts[0].trim();
    const to = parts[1].trim();

    if (from) sourcePhonemes.add(from);
    if (to) targetPhonemes.add(to);
  }

  return {
    source: Array.from(sourcePhonemes).sort(),
    target: Array.from(targetPhonemes).sort()
  };
}

function extractLanguageCodes(filename) {
  // Filename format: source-lang_target-lang.phono
  const base = basename(filename, '.phono');
  const parts = base.split('_');

  if (parts.length !== 2) {
    throw new Error(`Invalid filename format: ${filename}. Expected: source-lang_target-lang.phono`);
  }

  return {
    source: parts[0],
    target: parts[1]
  };
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: node scripts/generate-phonemes.js <ruleset-file>');
    console.error('Example: node scripts/generate-phonemes.js public/rules/sem-pro_arb.phono');
    process.exit(1);
  }

  const rulesetPath = args[0];

  try {
    console.log(`Processing ${rulesetPath}...`);

    // Parse the ruleset
    const { source, target } = parseRuleset(rulesetPath);

    // Extract language codes from filename
    const { source: sourceLang, target: targetLang } = extractLanguageCodes(rulesetPath);

    // Determine output paths
    const phonemesDir = join(dirname(dirname(rulesetPath)), 'phonemes');
    const sourceFile = join(phonemesDir, `${sourceLang}.phonemes`);
    const targetFile = join(phonemesDir, `${targetLang}.phonemes`);

    // Generate content
    const sourceContent = source.join(' ');
    const targetContent = target.join(' ');

    // Write files
    writeFileSync(sourceFile, sourceContent, 'utf-8');
    writeFileSync(targetFile, targetContent, 'utf-8');

    console.log('\nGenerated phoneme files:');
    console.log(`  Source (${sourceLang}): ${sourceFile}`);
    console.log(`    ${source.length} phonemes: ${sourceContent}`);
    console.log(`  Target (${targetLang}): ${targetFile}`);
    console.log(`    ${target.length} phonemes: ${targetContent}`);
    console.log('\n✓ Done!');

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
