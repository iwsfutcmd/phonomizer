<script lang="ts">
  import type { PhonotacticPattern, Rule } from '../types';
  import { generateAllWords } from '../utils/word-generator';
  import { applyRules } from '../rules/engine';
  import { reverseRules, createReverser } from '../rules/reverser';

  interface Props {
    sourcePhonotactics: PhonotacticPattern[] | null;
    targetPhonotactics: PhonotacticPattern[] | null;
    sourceLang: string;
    targetLang: string;
    rules: Rule[];
    sourcePhonemeSet: string[];
    targetPhonemeSet: string[];
  }

  let {
    sourcePhonotactics,
    targetPhonotactics,
    sourceLang,
    targetLang,
    rules,
    sourcePhonemeSet,
    targetPhonemeSet,
  }: Props = $props();

  const PAGE_SIZE = 100;
  const CHUNK_SIZE = 200;

  interface AnalysisEntry {
    word: string;
    output?: string;
    inputs?: string[];
    error?: string;
  }

  type AnalysisStatus = 'idle' | 'running' | 'done';
  type Filter = 'all' | 'no-output' | 'has-output' | 'no-source' | 'single' | 'multiple';

  let side = $state<'source' | 'target'>('source');
  let page = $state(0);
  let selectedWord = $state<string | null>(null);
  let transformResult = $state<string | string[] | null>(null);
  let transformError = $state('');
  let analysisStatus = $state<AnalysisStatus>('idle');
  let analysisProgress = $state(0);
  let analysisEntries = $state<AnalysisEntry[]>([]);
  let activeFilter = $state<Filter>('all');
  // Key that was current when analysis last completed; compared to currentInputKey to detect stale results.
  let analysisInputKey = $state('');

  let currentToken = 0; // non-reactive abort token

  // Cached reverser instance — pre-computes shared state (expanded phonemes,
  // sorted phoneme arrays) and holds a per-word result cache.
  // Recreated only when the input key changes; re-analysis with the same
  // inputs returns cached results instantly.
  let _reverser: ((word: string) => string[]) | null = null;
  let _reverserKey = '';

  function getReverser(): (word: string) => string[] {
    if (_reverserKey !== currentInputKey || _reverser === null) {
      _reverser = createReverser(
        rules, sourcePhonemeSet, targetPhonemeSet,
        sourcePhonotactics, targetPhonotactics
      );
      _reverserKey = currentInputKey;
    }
    return _reverser;
  }

  let currentPhonotactics = $derived(
    side === 'source' ? sourcePhonotactics : targetPhonotactics
  );
  let words = $derived(generateAllWords(currentPhonotactics));

  // A lightweight fingerprint of the current analysis inputs.
  // When this changes, existing analysis results are considered stale.
  let currentInputKey = $derived(
    `${side}|${words.length}|${rules.length}|${sourcePhonemeSet.length}|${targetPhonemeSet.length}`
  );

  // Analysis results are valid only when they match the current inputs.
  let analysisValid = $derived(
    analysisStatus === 'done' && analysisInputKey === currentInputKey
  );

  let analysisMap = $derived(
    new Map<string, AnalysisEntry>(
      analysisValid ? analysisEntries.map(e => [e.word, e]) : []
    )
  );

  let filterCounts = $derived.by(() => {
    if (!analysisValid) return null;
    const entries = analysisEntries;
    if (side === 'source') {
      const noOutput = entries.filter(e => !!e.error).length;
      return { total: entries.length, noOutput, hasOutput: entries.length - noOutput };
    } else {
      return {
        total: entries.length,
        noSource: entries.filter(e => !e.error && e.inputs!.length === 0).length,
        single:   entries.filter(e => !e.error && e.inputs!.length === 1).length,
        multiple: entries.filter(e => !e.error && e.inputs!.length > 1).length,
      };
    }
  });

  let filteredEntries = $derived.by((): AnalysisEntry[] | null => {
    if (!analysisValid) return null;
    const entries = analysisEntries;
    switch (activeFilter) {
      case 'all':        return entries;
      case 'no-output':  return entries.filter(e => !!e.error);
      case 'has-output': return entries.filter(e => !e.error);
      case 'no-source':  return entries.filter(e => !e.error && e.inputs!.length === 0);
      case 'single':     return entries.filter(e => !e.error && e.inputs!.length === 1);
      case 'multiple':   return entries.filter(e => !e.error && e.inputs!.length > 1);
      default:           return entries;
    }
  });

  let displayWords = $derived(
    filteredEntries ? filteredEntries.map(e => e.word) : words
  );
  let totalPages = $derived(Math.ceil(displayWords.length / PAGE_SIZE));
  let pageWords = $derived(displayWords.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));

  function setSide(newSide: 'source' | 'target') {
    side = newSide;
    page = 0;
    activeFilter = 'all';
    selectedWord = null;
    transformResult = null;
    transformError = '';
    // Clear analysis so stale entries from the other side are not shown
    analysisEntries = [];
    analysisStatus = 'idle';
    analysisInputKey = '';
  }

  function setFilter(f: Filter) {
    activeFilter = f;
    page = 0;
    selectedWord = null;
    transformResult = null;
    transformError = '';
  }

  function handleWordClick(word: string) {
    selectedWord = word;
    transformError = '';
    transformResult = null;

    const entry = analysisMap.get(word);
    if (entry) {
      if (entry.error) {
        transformError = entry.error;
      } else {
        transformResult = entry.output !== undefined ? entry.output
          : entry.inputs !== undefined ? entry.inputs
          : null;
      }
      return;
    }

    // Compute on-the-fly when no pre-computed result exists
    try {
      if (side === 'source') {
        transformResult = applyRules(
          word, rules, sourcePhonemeSet, targetPhonemeSet,
          sourcePhonotactics, targetPhonotactics
        );
      } else {
        transformResult = getReverser()(word);
      }
    } catch (e) {
      transformError = e instanceof Error ? e.message : 'Error';
    }
  }

  async function runAnalysis() {
    currentToken++;
    const token = currentToken;
    const targetKey = currentInputKey; // which inputs we're analyzing

    analysisStatus = 'running';
    analysisProgress = 0;
    analysisEntries = [];
    activeFilter = 'all';
    selectedWord = null;
    transformResult = null;
    transformError = '';

    const allWords = words; // snapshot before any async gap
    const entries: AnalysisEntry[] = [];

    // For backward analysis, create the reverser once outside the loop so
    // pre-computed state (expanded phonemes, sorted arrays) is shared across
    // all words. Results are also cached inside the reverser so re-analysis
    // with the same inputs completes instantly.
    const reverseWord = side === 'target' ? getReverser() : null;

    for (let i = 0; i < allWords.length; i += CHUNK_SIZE) {
      if (currentToken !== token) return; // aborted by side/ruleset change

      const chunk = allWords.slice(i, Math.min(i + CHUNK_SIZE, allWords.length));
      for (const word of chunk) {
        if (side === 'source') {
          try {
            const output = applyRules(
              word, rules, sourcePhonemeSet, targetPhonemeSet,
              sourcePhonotactics, targetPhonotactics
            );
            entries.push({ word, output });
          } catch (e) {
            entries.push({ word, error: e instanceof Error ? e.message : 'Error' });
          }
        } else {
          try {
            const inputs = reverseWord!(word);
            entries.push({ word, inputs });
          } catch (e) {
            entries.push({ word, error: e instanceof Error ? e.message : 'Error' });
          }
        }
      }

      analysisProgress = entries.length;
      await new Promise<void>(resolve => setTimeout(resolve, 0)); // yield to UI
    }

    if (currentToken === token) {
      analysisEntries = entries;
      analysisInputKey = targetKey; // stamp which inputs produced these results
      analysisStatus = 'done';
    }
  }

  function formatCount(n: number): string {
    return n.toLocaleString();
  }
</script>

<div class="word-generator">
  <div class="side-toggle">
    <button class:active={side === 'source'} onclick={() => setSide('source')}>
      Source: {sourceLang || 'source'}
    </button>
    <button class:active={side === 'target'} onclick={() => setSide('target')}>
      Target: {targetLang || 'target'}
    </button>
  </div>

  {#if currentPhonotactics === null}
    <div class="no-phonotactics">
      No phonotactics defined for {side === 'source' ? (sourceLang || 'source language') : (targetLang || 'target language')}
    </div>
  {:else}
    <div class="toolbar">
      <span class="word-count">
        {formatCount(words.length)} word{words.length !== 1 ? 's' : ''}
      </span>
      {#if analysisStatus === 'running'}
        <span class="progress-text">
          Analyzing {formatCount(analysisProgress)} / {formatCount(words.length)}…
        </span>
      {:else}
        <button class="analyze-btn" class:secondary={analysisValid} onclick={runAnalysis} disabled={words.length === 0}>
          {analysisValid ? 'Re-analyze' : 'Analyze all'}
        </button>
      {/if}
    </div>

    {#if analysisValid && filterCounts}
      <div class="filter-tabs">
        <button class:active={activeFilter === 'all'} onclick={() => setFilter('all')}>
          All ({formatCount(filterCounts.total)})
        </button>
        {#if side === 'source'}
          <button class:active={activeFilter === 'no-output'} onclick={() => setFilter('no-output')}>
            No output ({formatCount(filterCounts.noOutput ?? 0)})
          </button>
          <button class:active={activeFilter === 'has-output'} onclick={() => setFilter('has-output')}>
            Has output ({formatCount(filterCounts.hasOutput ?? 0)})
          </button>
        {:else}
          <button class:active={activeFilter === 'no-source'} onclick={() => setFilter('no-source')}>
            No source ({formatCount(filterCounts.noSource ?? 0)})
          </button>
          <button class:active={activeFilter === 'single'} onclick={() => setFilter('single')}>
            1 source ({formatCount(filterCounts.single ?? 0)})
          </button>
          <button class:active={activeFilter === 'multiple'} onclick={() => setFilter('multiple')}>
            Multiple sources ({formatCount(filterCounts.multiple ?? 0)})
          </button>
        {/if}
      </div>
    {/if}

    {#if selectedWord !== null}
      <div class="transform-result">
        <span class="selected-word">{selectedWord}</span>
        <span class="arrow">{side === 'source' ? '→' : '←'}</span>
        {#if transformError}
          <span class="result-error">{transformError}</span>
        {:else if transformResult !== null}
          {#if typeof transformResult === 'string'}
            <span class="result-word">{transformResult}</span>
          {:else if transformResult.length === 0}
            <span class="no-result">(no results)</span>
          {:else}
            <div class="result-chips">
              {#each transformResult as r}
                <span class="result-chip">{r}</span>
              {/each}
            </div>
          {/if}
        {/if}
      </div>
    {/if}

    {#if words.length === 0}
      <div class="no-words">No words generated (all patterns are empty).</div>
    {:else if filteredEntries !== null && filteredEntries.length === 0}
      <div class="no-words">No words match this filter.</div>
    {:else}
      <div class="word-list">
        {#each pageWords as word}
          <button
            class="word-chip"
            class:selected={word === selectedWord}
            onclick={() => handleWordClick(word)}
          >{word}</button>
        {/each}
      </div>

      {#if totalPages > 1}
        <div class="pagination">
          <button onclick={() => page = Math.max(0, page - 1)} disabled={page === 0}>
            ← Prev
          </button>
          <span class="page-info">Page {page + 1} of {totalPages}</span>
          <button onclick={() => page = Math.min(totalPages - 1, page + 1)} disabled={page >= totalPages - 1}>
            Next →
          </button>
        </div>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .word-generator {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .side-toggle {
    display: flex;
    gap: 0.5rem;
  }

  .side-toggle button {
    padding: 0.5rem 1rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: white;
    color: #333;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.2s;
  }

  .side-toggle button:hover {
    border-color: #4a90e2;
    color: #4a90e2;
  }

  .side-toggle button.active {
    background: #4a90e2;
    color: white;
    border-color: #4a90e2;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .word-count {
    font-size: 1rem;
    color: #555;
    font-weight: 500;
  }

  .analyze-btn {
    padding: 0.4rem 1rem;
    border: 1px solid #4a90e2;
    border-radius: 4px;
    background: #4a90e2;
    color: white;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
    transition: all 0.2s;
  }

  .analyze-btn:hover:not(:disabled) {
    background: #357abd;
    border-color: #357abd;
  }

  .analyze-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .analyze-btn.secondary {
    background: white;
    color: #4a90e2;
  }

  .analyze-btn.secondary:hover:not(:disabled) {
    background: #e8f0fb;
  }

  .progress-text {
    font-size: 0.9rem;
    color: #666;
    font-style: italic;
  }

  .filter-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .filter-tabs button {
    padding: 0.3rem 0.8rem;
    border: 1px solid #ddd;
    border-radius: 20px;
    background: white;
    color: #555;
    cursor: pointer;
    font-size: 0.85rem;
    transition: all 0.15s;
  }

  .filter-tabs button:hover {
    border-color: #4a90e2;
    color: #4a90e2;
  }

  .filter-tabs button.active {
    background: #4a90e2;
    color: white;
    border-color: #4a90e2;
  }

  .no-phonotactics,
  .no-words {
    color: #999;
    font-style: italic;
    padding: 1rem 0;
  }

  .transform-result {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: #f0f6ff;
    border: 1px solid #c5d9f5;
    border-radius: 6px;
    font-family: 'Courier New', monospace;
  }

  .selected-word {
    font-size: 1.2rem;
    font-weight: 700;
    color: #2c5aa0;
  }

  .arrow {
    font-size: 1.1rem;
    color: #666;
  }

  .result-word {
    font-size: 1.2rem;
    color: #1a6b1a;
    font-weight: 600;
  }

  .result-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .result-chip {
    font-size: 0.95rem;
    padding: 0.15rem 0.45rem;
    background: #e8f5e8;
    border: 1px solid #b8ddb8;
    border-radius: 3px;
    color: #1a6b1a;
  }

  .no-result {
    font-size: 0.95rem;
    color: #999;
    font-style: italic;
  }

  .result-error {
    font-size: 0.9rem;
    color: #d32f2f;
  }

  .word-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    padding: 0.75rem;
    background: #f8f8f8;
    border-radius: 4px;
    border: 1px solid #e8e8e8;
    max-height: 400px;
    overflow-y: auto;
  }

  .word-chip {
    font-family: 'Courier New', monospace;
    font-size: 0.95rem;
    padding: 0.2rem 0.5rem;
    background: white;
    border: 1px solid #ddd;
    border-radius: 3px;
    color: #2c5aa0;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .word-chip:hover {
    background: #e8f0fb;
    border-color: #4a90e2;
  }

  .word-chip.selected {
    background: #4a90e2;
    color: white;
    border-color: #4a90e2;
  }

  .pagination {
    display: flex;
    align-items: center;
    gap: 1rem;
    justify-content: center;
    padding-top: 0.5rem;
  }

  .pagination button {
    padding: 0.5rem 1rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: white;
    color: #333;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.2s;
  }

  .pagination button:hover:not(:disabled) {
    border-color: #4a90e2;
    color: #4a90e2;
  }

  .pagination button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .page-info {
    font-size: 0.9rem;
    color: #555;
    min-width: 120px;
    text-align: center;
  }
</style>
