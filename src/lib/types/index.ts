export interface Rule {
  from: string[];           // Source phoneme sequence (e.g., ['a', 'j'] or ['t', 'h'])
  to: string[];             // Target phoneme sequence (empty array for deletion)
  leftContext?: string[];   // Context before (e.g., ['t', 'h'] or ['#'] for word boundary)
  rightContext?: string[];  // Context after (e.g., ['t', 'h'] or ['#'] for word boundary)
}

export interface TransformResult {
  output: string;
}

export interface ReverseResult {
  inputs: string[];
}

export interface PhonemeSet {
  phonemes: string[];
}
