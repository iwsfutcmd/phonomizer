<script lang="ts">
  import { onMount } from 'svelte';
  import { parseRules } from './lib/rules/parser';
  import { applyRules } from './lib/rules/engine';
  import { reverseRules } from './lib/rules/reverser';
  import PhonemeExtractor from './lib/components/PhonemeExtractor.svelte';

  interface RulesetData {
    source: string;
    target: string;
  }

  interface Ruleset extends RulesetData {
    id: string;
    rulesFile: string;
    sourcePhonemes: string;
    targetPhonemes: string;
  }

  // Helper function to create a full Ruleset from minimal data
  function createRuleset(data: RulesetData): Ruleset {
    const id = `${data.source}_${data.target}`;
    return {
      ...data,
      id,
      rulesFile: `/rules/${id}.phono`,
      sourcePhonemes: `/phonemes/${data.source}.phonemes`,
      targetPhonemes: `/phonemes/${data.target}.phonemes`
    };
  }

  let rulesets = $state<Ruleset[]>([]);
  let languages = $state<Record<string, string>>({});
  let selectedRulesetId = $state('sem-pro_arb');
  let rulesText = $state('');
  let inputWord = $state('');
  let sourcePhonemes = $state('');
  let targetPhonemes = $state('');
  let mode = $state<'forward' | 'backward' | 'cognates'>('forward');
  let result = $state<string | string[]>('');
  let error = $state('');

  // For cognates mode
  let sourceLanguage = $state('arb');
  let targetLanguage = $state('hbo');
  let sourceLanguagePhonemes = $state('');

  // Derived: Get available languages from rulesets
  let availableLanguages = $derived(
    rulesets
      .map(r => ({
        code: r.target,
        displayName: languages[r.target] || r.target
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
  );

  // Helper function to get ruleset display name
  function getRulesetDisplayName(ruleset: Ruleset): string {
    const sourceName = languages[ruleset.source] || ruleset.source;
    const targetName = languages[ruleset.target] || ruleset.target;
    return `${sourceName} → ${targetName}`;
  }

  // Discover all rule files at build time using Vite's glob
  const ruleFiles = import.meta.glob('/public/rules/*.phono', { eager: false, query: '?url', import: 'default' });

  // Load available rulesets and languages on mount
  onMount(async () => {
    try {
      // Load language names
      const languagesResponse = await fetch('/language_names.json');
      if (languagesResponse.ok) {
        languages = await languagesResponse.json();
      }

      // Extract rulesets from discovered rule files
      const rulesetData: RulesetData[] = Object.keys(ruleFiles)
        .map(path => {
          // Extract filename from path: /public/rules/sem-pro_akk.phono -> sem-pro_akk
          const filename = path.split('/').pop()?.replace('.phono', '');
          if (!filename) return null;

          const [source, target] = filename.split('_');
          return source && target ? { source, target } : null;
        })
        .filter((data): data is RulesetData => data !== null);

      rulesets = rulesetData.map(createRuleset);

      // Load the default ruleset
      await loadRuleset(selectedRulesetId);
      // Load initial source language phonemes for cognates mode
      await loadSourceLanguagePhonemes(sourceLanguage);
    } catch (e) {
      console.error('Failed to load rulesets:', e);
    }
  });

  // Reload source language phonemes when source language changes
  $effect(() => {
    if (mode === 'cognates' && rulesets.length > 0) {
      loadSourceLanguagePhonemes(sourceLanguage);
    }
  });

  // Load a specific ruleset
  async function loadRuleset(rulesetId: string) {
    const ruleset = rulesets.find(r => r.id === rulesetId);
    if (!ruleset) return;

    try {
      // Load rules
      const rulesResponse = await fetch(ruleset.rulesFile);
      if (rulesResponse.ok) {
        rulesText = await rulesResponse.text();
      }

      // Load source phonemes
      const sourceResponse = await fetch(ruleset.sourcePhonemes);
      if (sourceResponse.ok) {
        sourcePhonemes = await sourceResponse.text();
      }

      // Load target phonemes
      const targetResponse = await fetch(ruleset.targetPhonemes);
      if (targetResponse.ok) {
        targetPhonemes = await targetResponse.text();
      }
    } catch (e) {
      console.error('Failed to load ruleset:', e);
    }
  }

  // Handle ruleset selection change
  async function handleRulesetChange() {
    await loadRuleset(selectedRulesetId);
    // Clear previous results when switching rulesets
    result = '';
    error = '';
  }

  function parsePhonemes(phonemeText: string): string[] {
    return phonemeText
      .split(/[\s,]+/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
  }

  async function handleApply() {
    error = '';
    result = '';

    try {
      if (mode === 'cognates') {
        result = await findCognates(inputWord, sourceLanguage, targetLanguage);
      } else {
        const rules = parseRules(rulesText);
        const sourcePhonemeSet = parsePhonemes(sourcePhonemes);
        const targetPhonemeSet = parsePhonemes(targetPhonemes);

        if (mode === 'forward') {
          result = applyRules(inputWord, rules, sourcePhonemeSet, targetPhonemeSet);
        } else {
          result = reverseRules(inputWord, rules, sourcePhonemeSet, targetPhonemeSet);
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'An error occurred';
    }
  }

  async function findCognates(word: string, sourceLang: string, targetLang: string): Promise<string[]> {
    // Find rulesets for both languages
    const sourceRuleset = rulesets.find(r => r.id.endsWith(`_${sourceLang}`));
    const targetRuleset = rulesets.find(r => r.id.endsWith(`_${targetLang}`));

    if (!sourceRuleset) {
      throw new Error(`No ruleset found for source language: ${sourceLang}`);
    }
    if (!targetRuleset) {
      throw new Error(`No ruleset found for target language: ${targetLang}`);
    }

    // Extract common ancestor (should be the same for both)
    const sourceAncestor = sourceRuleset.id.split('_')[0];
    const targetAncestor = targetRuleset.id.split('_')[0];

    if (sourceAncestor !== targetAncestor) {
      throw new Error(`Languages do not share a common ancestor: ${sourceAncestor} vs ${targetAncestor}`);
    }

    // Load source ruleset
    const [sourceRulesResp, sourcePhonResp, ancestorPhonResp] = await Promise.all([
      fetch(sourceRuleset.rulesFile),
      fetch(sourceRuleset.targetPhonemes),
      fetch(sourceRuleset.sourcePhonemes)
    ]);

    const sourceRulesText = await sourceRulesResp.text();
    const sourcePhons = await sourcePhonResp.text();
    const ancestorPhons = await ancestorPhonResp.text();

    const sourceRules = parseRules(sourceRulesText);
    const sourcePhonSet = parsePhonemes(sourcePhons);
    const ancestorPhonSet = parsePhonemes(ancestorPhons);

    // Step 1: Reverse source language rules to get proto-forms
    const protoForms = reverseRules(word, sourceRules, ancestorPhonSet, sourcePhonSet);

    // Load target ruleset
    const [targetRulesResp, targetPhonResp] = await Promise.all([
      fetch(targetRuleset.rulesFile),
      fetch(targetRuleset.targetPhonemes)
    ]);

    const targetRulesText = await targetRulesResp.text();
    const targetPhons = await targetPhonResp.text();

    const targetRules = parseRules(targetRulesText);
    const targetPhonSet = parsePhonemes(targetPhons);

    // Step 2: Apply target language rules to each proto-form
    const cognates = new Set<string>();
    for (const protoForm of protoForms) {
      try {
        const targetForm = applyRules(protoForm, targetRules, ancestorPhonSet, targetPhonSet);

        // Validate that the result only uses target phonemes
        let isValid = true;
        const sortedTargetPhons = [...targetPhonSet].sort((a, b) => b.length - a.length);
        let pos = 0;
        while (pos < targetForm.length && isValid) {
          let matched = false;
          for (const phoneme of sortedTargetPhons) {
            if (targetForm.substring(pos, pos + phoneme.length) === phoneme) {
              pos += phoneme.length;
              matched = true;
              break;
            }
          }
          if (!matched) {
            isValid = false;
          }
        }

        if (isValid) {
          cognates.add(targetForm);
        }
      } catch (e) {
        // Skip invalid proto-forms
        continue;
      }
    }

    return Array.from(cognates).sort();
  }

  // Load source language phonemes for cognates mode
  async function loadSourceLanguagePhonemes(lang: string) {
    const ruleset = rulesets.find(r => r.id.endsWith(`_${lang}`));
    if (!ruleset) return;

    try {
      const response = await fetch(ruleset.targetPhonemes);
      if (response.ok) {
        sourceLanguagePhonemes = await response.text();
      }
    } catch (e) {
      console.error('Failed to load source language phonemes:', e);
    }
  }

  // Get non-ASCII phonemes for the current mode
  function getNonAsciiPhonemes(): string[] {
    let phonemeSet: string;

    if (mode === 'cognates') {
      phonemeSet = sourceLanguagePhonemes;
    } else {
      phonemeSet = mode === 'forward' ? sourcePhonemes : targetPhonemes;
    }

    const phonemeList = parsePhonemes(phonemeSet);
    return phonemeList.filter(p => /[^\x00-\x7F]/.test(p));
  }

  // Insert phoneme at cursor position
  function insertPhoneme(phoneme: string) {
    const input = document.getElementById('word') as HTMLInputElement;
    if (!input) return;

    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const before = inputWord.substring(0, start);
    const after = inputWord.substring(end);

    inputWord = before + phoneme + after;

    // Set cursor position after inserted phoneme
    setTimeout(() => {
      input.focus();
      input.setSelectionRange(start + phoneme.length, start + phoneme.length);
    }, 0);
  }
</script>

<main>
  <h1>Phonomizer</h1>
  <p class="subtitle">Apply phonological rules forward and backward</p>

  <div class="container">
    <!-- Rules Column -->
    <div class="rules-column">
      <label for="rules">
        <strong>Phonological Rules</strong>
        <span class="hint">One rule per line, format: "a > x;"</span>
      </label>
      <textarea
        id="rules"
        bind:value={rulesText}
        placeholder="a > x;&#10;b > y;"
      ></textarea>
    </div>

    <!-- Controls Column -->
    <div class="controls-column">
      {#if mode === 'cognates'}
        <div class="language-selectors">
          <div class="language-selector">
            <label for="source-lang">
              <strong>Source Language</strong>
            </label>
            <select id="source-lang" bind:value={sourceLanguage}>
              {#each availableLanguages as lang}
                <option value={lang.code}>{lang.displayName}</option>
              {/each}
            </select>
          </div>

          <div class="language-selector">
            <label for="target-lang">
              <strong>Target Language</strong>
            </label>
            <select id="target-lang" bind:value={targetLanguage}>
              {#each availableLanguages as lang}
                <option value={lang.code}>{lang.displayName}</option>
              {/each}
            </select>
          </div>
        </div>
      {:else}
        <div class="ruleset-selector">
          <label for="ruleset">
            <strong>Ruleset</strong>
          </label>
          <select id="ruleset" bind:value={selectedRulesetId} onchange={handleRulesetChange}>
            {#each rulesets as ruleset}
              <option value={ruleset.id}>{getRulesetDisplayName(ruleset)}</option>
            {/each}
          </select>
        </div>

        <div class="phoneme-sets">
        <div class="phoneme-input">
          <label for="source-phonemes">
            <strong>Source Phonemes</strong>
            <span class="hint">Space or comma separated</span>
          </label>
          <input
            id="source-phonemes"
            type="text"
            bind:value={sourcePhonemes}
            placeholder="a b c"
          />
        </div>

        <div class="phoneme-input">
          <label for="target-phonemes">
            <strong>Target Phonemes</strong>
            <span class="hint">Space or comma separated</span>
          </label>
          <input
            id="target-phonemes"
            type="text"
            bind:value={targetPhonemes}
            placeholder="x y"
          />
        </div>
      </div>

      <!-- Phoneme Extractor -->
      <PhonemeExtractor rulesText={rulesText} />
      {/if}

      <div class="word-section">
        <label for="word">
          <strong>{mode === 'cognates' ? 'Word in Source Language' : mode === 'forward' ? 'Source Word' : 'Target Word'}</strong>
        </label>
        <input
          id="word"
          type="text"
          bind:value={inputWord}
          placeholder={mode === 'forward' ? 'abc' : 'xyx'}
        />

        {#if getNonAsciiPhonemes().length > 0}
          <div class="phoneme-picker">
            <span class="picker-label">Insert phoneme:</span>
            <div class="phoneme-buttons">
              {#each getNonAsciiPhonemes() as phoneme}
                <button
                  type="button"
                  class="phoneme-btn"
                  onclick={() => insertPhoneme(phoneme)}
                >
                  {phoneme}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <div class="controls">
        <div class="mode-toggle">
          <button
            class:active={mode === 'forward'}
            onclick={() => mode = 'forward'}
          >
            Forward →
          </button>
          <button
            class:active={mode === 'backward'}
            onclick={() => mode = 'backward'}
          >
            ← Backward
          </button>
          <button
            class:active={mode === 'cognates'}
            onclick={() => mode = 'cognates'}
          >
            ↔ Cognates
          </button>
        </div>

        <button class="apply-btn" onclick={handleApply}>
          {mode === 'cognates' ? 'Find Cognates' : 'Apply Rules'}
        </button>
      </div>
    </div>

    <!-- Results Column -->
    <div class="results-column">
      <h2>Result{Array.isArray(result) && result.length !== 1 ? 's' : ''}</h2>

      {#if error}
        <div class="error">{error}</div>
      {:else if result}
        {#if Array.isArray(result)}
          {#if result.length === 0}
            <div class="no-results">No possible inputs found</div>
          {:else}
            <ul class="result-list">
              {#each result as item}
                <li>{item}</li>
              {/each}
            </ul>
          {/if}
        {:else}
          <div class="result-single">{result}</div>
        {/if}
      {:else}
        <div class="placeholder">Results will appear here</div>
      {/if}
    </div>
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background: #f5f5f5;
  }

  main {
    max-width: 1600px;
    margin: 0 auto;
    padding: 1rem 2rem;
  }

  h1 {
    margin: 0;
    font-size: 1.5rem;
    color: #333;
    display: inline-block;
  }

  .subtitle {
    margin: 0 0 1rem 0;
    color: #666;
    font-size: 0.9rem;
    display: inline-block;
    margin-left: 1rem;
  }

  .container {
    display: grid;
    grid-template-columns: 300px 1fr 1fr;
    gap: 1.5rem;
    background: white;
    padding: 2rem;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    min-height: 600px;
  }

  .rules-column {
    display: flex;
    flex-direction: column;
    border-right: 2px solid #eee;
    padding-right: 1.5rem;
  }

  .rules-column textarea {
    flex: 1;
    min-height: 500px;
    resize: vertical;
  }

  .controls-column {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 0 1.5rem;
  }

  .ruleset-selector {
    display: flex;
    flex-direction: column;
  }

  .language-selectors {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .language-selector {
    display: flex;
    flex-direction: column;
  }

  select {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 1rem;
    background: white;
    color: #333;
    cursor: pointer;
    box-sizing: border-box;
  }

  select:focus {
    outline: none;
    border-color: #4a90e2;
  }

  .phoneme-sets {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .phoneme-input {
    display: flex;
    flex-direction: column;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    color: #333;
  }

  .hint {
    font-size: 0.85rem;
    color: #666;
    font-weight: normal;
  }

  textarea {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    font-size: 1rem;
    resize: vertical;
    box-sizing: border-box;
  }

  input[type="text"] {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    font-size: 1.1rem;
    box-sizing: border-box;
  }

  textarea:focus,
  input[type="text"]:focus {
    outline: none;
    border-color: #4a90e2;
  }

  .phoneme-picker {
    margin-top: 0.75rem;
    padding: 0.75rem;
    background: #f8f8f8;
    border-radius: 4px;
    border: 1px solid #e0e0e0;
  }

  .picker-label {
    font-size: 0.85rem;
    color: #666;
    display: block;
    margin-bottom: 0.5rem;
  }

  .phoneme-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .phoneme-btn {
    padding: 0.5rem 0.75rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: white;
    cursor: pointer;
    font-family: 'Courier New', monospace;
    font-size: 1.1rem;
    transition: all 0.2s;
    min-width: 2.5rem;
  }

  .phoneme-btn:hover {
    background: #4a90e2;
    color: white;
    border-color: #4a90e2;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .phoneme-btn:active {
    transform: translateY(0);
  }

  .controls {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .mode-toggle {
    display: flex;
    gap: 0.5rem;
  }

  button {
    padding: 0.75rem 1.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: white;
    color: #333;
    cursor: pointer;
    font-size: 0.95rem;
    transition: all 0.2s;
  }

  button:hover {
    border-color: #4a90e2;
    color: #4a90e2;
  }

  button.active {
    background: #4a90e2;
    color: white;
    border-color: #4a90e2;
  }

  .apply-btn {
    background: #4a90e2;
    color: white;
    border: none;
    font-weight: 600;
    margin-left: auto;
  }

  .apply-btn:hover {
    background: #357abd;
  }

  .results-column {
    border-left: 2px solid #eee;
    padding-left: 1.5rem;
  }

  h2 {
    margin: 0 0 1rem 0;
    color: #333;
    font-size: 1.5rem;
  }

  .result-single {
    font-family: 'Courier New', monospace;
    font-size: 1.5rem;
    padding: 1rem;
    background: #f8f8f8;
    border-radius: 4px;
    color: #2c5aa0;
  }

  .result-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .result-list li {
    font-family: 'Courier New', monospace;
    font-size: 1.2rem;
    padding: 0.75rem;
    background: #f8f8f8;
    border-radius: 4px;
    margin-bottom: 0.5rem;
    color: #2c5aa0;
  }

  .placeholder,
  .no-results {
    color: #999;
    font-style: italic;
    padding: 1rem;
  }

  .error {
    color: #d32f2f;
    background: #ffebee;
    padding: 1rem;
    border-radius: 4px;
    border-left: 4px solid #d32f2f;
  }

  @media (max-width: 1200px) {
    .container {
      grid-template-columns: 1fr;
    }

    .rules-column {
      border-right: none;
      border-bottom: 2px solid #eee;
      padding-right: 0;
      padding-bottom: 1.5rem;
    }

    .rules-column textarea {
      min-height: 300px;
    }

    .controls-column {
      padding: 1.5rem 0;
    }

    .results-column {
      border-left: none;
      border-top: 2px solid #eee;
      padding-left: 0;
      padding-top: 1.5rem;
    }
  }
</style>
