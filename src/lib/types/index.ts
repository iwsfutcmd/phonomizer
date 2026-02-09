export interface Rule {
  from: string;
  to: string;
  leftContext?: string;   // Context before the phoneme (# = word boundary)
  rightContext?: string;  // Context after the phoneme (# = word boundary)
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
