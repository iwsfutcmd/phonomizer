<script lang="ts">
  import { extractPhonemes } from '../utils/phoneme-extractor';

  interface Props {
    rulesText: string;
    onUsePhonemes?: (source: string, target: string) => void;
  }

  let { rulesText, onUsePhonemes }: Props = $props();

  let isExpanded = $state(false);

  // Extract phonemes whenever rulesText changes
  let result = $derived.by(() => {
    if (!rulesText || rulesText.trim() === '') {
      return {
        source: [],
        target: [],
        intermediate: []
      };
    }

    try {
      return extractPhonemes(rulesText);
    } catch (error) {
      // If parsing fails, return empty
      return {
        source: [],
        target: [],
        intermediate: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  let hasPhonemes = $derived(
    result.source.length > 0 ||
    result.target.length > 0 ||
    result.intermediate.length > 0
  );

  // Format phonemes for display with proper spacing
  function formatPhonemes(phonemes: string[]): string {
    return phonemes.join(' ');
  }

  // Copy to clipboard
  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      alert(`${label} phonemes copied to clipboard!`);
    });
  }

  // Use extracted phonemes in the input fields
  function useExtractedPhonemes() {
    if (onUsePhonemes) {
      const source = formatPhonemes(result.source);
      const target = formatPhonemes(result.target);
      onUsePhonemes(source, target);
    }
  }
</script>

<div class="phoneme-extractor">
  <div class="header">
    <h3>📊 Phoneme Inventories</h3>
    <div class="header-buttons">
      {#if hasPhonemes && onUsePhonemes}
        <button class="use-btn" onclick={useExtractedPhonemes}>
          ⬆️ Use These Phonemes
        </button>
      {/if}
      <button class="toggle-btn" onclick={() => isExpanded = !isExpanded}>
        {isExpanded ? '▼ Hide' : '▶ Show'}
      </button>
    </div>
  </div>

  {#if isExpanded}
    {#if 'error' in result && result.error}
      <div class="error">
        ⚠️ Unable to extract phonemes: {result.error}
      </div>
    {:else if !hasPhonemes}
      <div class="empty">
        No rules defined yet. Add some rules to see phoneme inventories.
      </div>
    {:else}
      <div class="inventories">
      <!-- Source Phonemes -->
      <div class="inventory">
        <div class="inventory-header">
          <h4>Source Language</h4>
          <button
            class="copy-btn"
            onclick={() => copyToClipboard(formatPhonemes(result.source), 'Source')}
            disabled={result.source.length === 0}
          >
            📋 Copy
          </button>
        </div>
        <div class="phoneme-count">{result.source.length} phonemes</div>
        <div class="phoneme-list">
          {#if result.source.length > 0}
            {formatPhonemes(result.source)}
          {:else}
            <span class="empty-text">(none)</span>
          {/if}
        </div>
      </div>

      <!-- Target Phonemes -->
      <div class="inventory">
        <div class="inventory-header">
          <h4>Target Language</h4>
          <button
            class="copy-btn"
            onclick={() => copyToClipboard(formatPhonemes(result.target), 'Target')}
            disabled={result.target.length === 0}
          >
            📋 Copy
          </button>
        </div>
        <div class="phoneme-count">{result.target.length} phonemes</div>
        <div class="phoneme-list">
          {#if result.target.length > 0}
            {formatPhonemes(result.target)}
          {:else}
            <span class="empty-text">(none)</span>
          {/if}
        </div>
      </div>

      <!-- Intermediate Phonemes (if any) -->
      {#if result.intermediate.length > 0}
        <div class="inventory intermediate">
          <div class="inventory-header">
            <h4>⚡ Intermediate Forms</h4>
            <button
              class="copy-btn"
              onclick={() => copyToClipboard(formatPhonemes(result.intermediate), 'Intermediate')}
            >
              📋 Copy
            </button>
          </div>
          <div class="phoneme-count">{result.intermediate.length} phonemes</div>
          <div class="phoneme-list">
            {formatPhonemes(result.intermediate)}
          </div>
          <div class="help-text">
            These phonemes are produced by some rules and consumed by others. They appear in intermediate stages but not in the final inventories.
          </div>
        </div>
      {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .phoneme-extractor {
    background: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 6px;
    padding: 1rem;
    margin-top: 1rem;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .header-buttons {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  h3 {
    margin: 0;
    font-size: 1.1rem;
    color: #495057;
  }

  .toggle-btn {
    padding: 0.25rem 0.75rem;
    font-size: 0.85rem;
    background: white;
    border: 1px solid #ced4da;
    border-radius: 4px;
    cursor: pointer;
    color: #495057;
  }

  .toggle-btn:hover {
    background: #e9ecef;
  }

  .use-btn {
    padding: 0.25rem 0.75rem;
    font-size: 0.85rem;
    background: #4a90e2;
    color: white;
    border: 1px solid #4a90e2;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
  }

  .use-btn:hover {
    background: #357abd;
    border-color: #357abd;
  }

  .error {
    color: #dc3545;
    padding: 0.75rem;
    background: #f8d7da;
    border: 1px solid #f5c2c7;
    border-radius: 4px;
  }

  .empty {
    color: #6c757d;
    font-style: italic;
    padding: 1rem;
    text-align: center;
  }

  .inventories {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .inventory {
    background: white;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    padding: 0.75rem;
  }

  .inventory.intermediate {
    background: #fff3cd;
    border-color: #ffc107;
  }

  .inventory-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  h4 {
    margin: 0;
    font-size: 0.95rem;
    color: #212529;
  }

  .copy-btn {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    background: #e9ecef;
    border: 1px solid #ced4da;
    border-radius: 3px;
    cursor: pointer;
  }

  .copy-btn:hover:not(:disabled) {
    background: #dee2e6;
  }

  .copy-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .phoneme-count {
    font-size: 0.85rem;
    color: #6c757d;
    margin-bottom: 0.5rem;
  }

  .phoneme-list {
    font-family: 'Courier New', monospace;
    font-size: 1rem;
    padding: 0.5rem;
    background: #f8f9fa;
    border-radius: 3px;
    word-wrap: break-word;
    line-height: 1.6;
    color: #212529;
  }

  .intermediate .phoneme-list {
    background: #fffaeb;
    color: #212529;
  }

  .empty-text {
    color: #adb5bd;
    font-style: italic;
  }

  .help-text {
    margin-top: 0.5rem;
    font-size: 0.8rem;
    color: #856404;
    font-style: italic;
  }
</style>
