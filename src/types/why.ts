/** Confidence levels accepted from the WHY extraction model. */
export type WhyConfidence = 'low' | 'medium' | 'high';

/** Implementation selected for optional WHY enrichment. */
export type WhyEngine = 'llm' | 'jev';

/** Raw decision data emitted by a non-generative WHY extractor. */
export type WhySelectionDiagnostic = {
  /** Pull request associated with the decision. */
  prNumber: number;
  /** Jev primitive used to evaluate the candidate set. */
  questionType: 'choice' | 'noul';
  /** Option selected by the extractor, such as `candidate_0` or `none`. */
  selectedOption: string;
  /** Index of the selected input candidate, when a candidate was chosen. */
  selectedCandidateIndex?: number;
  /** Probability assigned to the selected option. */
  selectionProbability: number;
  /** Extractor-reported distribution certainty, when its primitive provides one. */
  confidence?: number;
  /** Compatibility bucket derived from the selected candidate probability. */
  mappedConfidence: WhyConfidence;
  /** Per-candidate probability that its text explicitly states the WHY. */
  candidateProbabilities: Array<{
    /** Candidate index from the extractor input. */
    candidateIndex: number;
    /** Probability that the candidate explicitly states the change rationale. */
    probability: number;
    /** Probability that the candidate's reason applies to this changelog change. */
    relevanceProbability?: number;
  }>;
};

/** Deterministic trust bucket computed before and after provider calls. */
export type WhyTrustBucket = 'none' | 'low' | 'medium' | 'high';

/** PR selected from the generated changelog section as a possible WHY target. */
export type WhyTarget = {
  /** PR number associated with the changelog bullet. */
  prNumber: number;
  /** Changelog bullet text without markdown bullet prefix. */
  itemText: string;
  /** Changelog section title, using the bot's internal section names. */
  sectionTitle: string;
  /** Optional author parsed from release notes or GitHub metadata. */
  author?: string;
};

/** Preprocessed PR material sent to the WHY extraction provider. */
export type WhyExtractionItem = {
  /** PR number associated with the changelog bullet. */
  prNumber: number;
  /** Changelog item text. */
  itemText: string;
  /** Changelog section title where this candidate was found. */
  sectionTitle: string;
  /** PR title from GitHub or the generated changelog item. */
  title: string;
  /** Short, bounded candidate snippets extracted from the PR description. */
  candidates: string[];
  /** Local trust score used to reject weak or ambiguous inputs. */
  trustScore: number;
  /** Local trust bucket for diagnostics. */
  trustBucket: WhyTrustBucket;
  /** Whether this candidate requires high provider confidence before rendering. */
  requiresHighConfidence: boolean;
};

/** Payload sent to provider-specific WHY extraction APIs. */
export type WhyExtractionInput = {
  /** Language requested for changelog output. */
  language: string;
  /** User-visible label configured for WHY notes. */
  whyLabel: string;
  /** Candidate PRs for WHY extraction. */
  items: WhyExtractionItem[];
};

/** Single WHY note returned by a provider. */
export type WhyExtractionResult = {
  /** PR number this WHY note belongs to. */
  prNumber: number;
  /** Concise reason for the change. */
  why: string;
  /** Provider confidence in the extracted reason. */
  confidence: WhyConfidence;
};

/** Normalized provider output for WHY extraction. */
export type WhyExtractionOutput = {
  /** Extracted WHY notes. Omit uncertain PRs instead of guessing. */
  items: WhyExtractionResult[];
  /** Optional raw selection details for experimental decision engines. */
  selectionDiagnostics?: WhySelectionDiagnostic[];
};

/** WHY note accepted for rendering. */
export type WhyNote = WhyExtractionResult & {
  /** Changelog section title where this note should be rendered. */
  sectionTitle: string;
  /** Local trust score from preprocessing. */
  trustScore: number;
  /** Local trust bucket from preprocessing. */
  trustBucket: WhyTrustBucket;
};

/** Aggregated diagnostics shown in dry-run output. */
export type WhyDiagnostics = {
  /** Whether WHY extraction was requested. */
  enabled: boolean;
  /** Extraction engine selected for this run. */
  engine: WhyEngine;
  /** Raw decision details, populated by experimental decision engines. */
  selectionDiagnostics: WhySelectionDiagnostic[];
  /** Whether the WHY extraction provider call completed successfully. */
  aiUsed: boolean;
  /** Number of candidate PRs found in eligible changelog sections. */
  targetsFound: number;
  /** Number of PR bodies fetched from GitHub. */
  prBodiesFetched: number;
  /** Number of PRs skipped before fetching. */
  skippedBeforeFetch: number;
  /** Number of PRs skipped after preprocessing due to weak trust. */
  skippedLowTrust: number;
  /** Number of WHY notes rendered into the changelog section. */
  notesRendered: number;
  /** Non-fatal fallback/skip reasons. */
  fallbackReasons: string[];
};
