#!/usr/bin/env node

/**
 * Utility to generate phoneme files from ruleset files
 *
 * Usage: node scripts/generate-phonemes.js <ruleset-file>
 * Example: node scripts/generate-phonemes.js public/rules/sem-pro_arb.phono
 *
 * This script now uses the actual parser to handle:
 * - Variables and nested references
 * - Phoneme classes
 * - Intermediate phonemes (phonemes produced and consumed by rules)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { basename, dirname, join } from 'path';
import { generatePhonemeFiles } from '../src/lib/utils/phoneme-extractor.ts';

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

/**
 * If the file already exists and has a [phonotactics] section,
 * preserve it and write the new inventory in section format.
 * Otherwise, just write the flat phoneme list.
 */
function mergeWithExistingPhonotactics(filePath, newPhonemes) {
  if (!existsSync(filePath)) return newPhonemes;

  const existing = readFileSync(filePath, 'utf-8');
  const phonotacticsMatch = existing.match(/\[phonotactics\]\n([\s\S]*)/);

  if (!phonotacticsMatch) return newPhonemes;

  // Existing file has phonotactics - preserve it with section format
  return `[inventory]\n${newPhonemes}\n\n[phonotactics]\n${phonotacticsMatch[1].trimEnd()}\n`;
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

    // Read the ruleset
    const rulesText = readFileSync(rulesetPath, 'utf-8');

    // Use the smart phoneme extractor
    const result = generatePhonemeFiles(rulesText);

    // Extract language codes from filename
    const { source: sourceLang, target: targetLang } = extractLanguageCodes(rulesetPath);

    // Determine output paths
    const phonemesDir = join(dirname(dirname(rulesetPath)), 'phonemes');
    const sourceFile = join(phonemesDir, `${sourceLang}.phonemes`);
    const targetFile = join(phonemesDir, `${targetLang}.phonemes`);

    // Write files, preserving existing [phonotactics] sections
    writeFileSync(sourceFile, mergeWithExistingPhonotactics(sourceFile, result.source), 'utf-8');
    writeFileSync(targetFile, mergeWithExistingPhonotactics(targetFile, result.target), 'utf-8');

    console.log('\n✅ Generated phoneme files:');
    console.log(`\n📄 Source (${sourceLang}): ${sourceFile}`);
    console.log(`   ${result.source.split(' ').length} phonemes: ${result.source}`);
    console.log(`\n📄 Target (${targetLang}): ${targetFile}`);
    console.log(`   ${result.target.split(' ').length} phonemes: ${result.target}`);

    if (result.intermediate) {
      console.log(`\n⚠️  Intermediate phonemes detected:`);
      console.log(`   ${result.intermediate.split(' ').length} phonemes: ${result.intermediate}`);
      console.log(`   (These are produced by some rules and consumed by others)`);
    }

    console.log('\n✓ Done!');

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main();
