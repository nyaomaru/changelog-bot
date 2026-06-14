/** Sections that can receive generated WHY notes. */
export const WHY_ELIGIBLE_SECTION_TITLES = [
  'Breaking Changes',
  'Added',
  'Changed',
  'Fixed',
] as const;

/** Default label rendered before generated WHY notes. */
export const DEFAULT_WHY_LABEL = 'Why';

/** Maximum PRs considered for WHY extraction by default. */
export const DEFAULT_WHY_MAX_PRS = 30;

/** Maximum preprocessed candidate characters sent per PR by default. */
export const DEFAULT_WHY_MAX_CHARS_PER_PR = 800;

/** Minimum accepted model confidence by default. */
export const DEFAULT_WHY_CONFIDENCE = 'medium' as const;

/** Raw PR body scan cap before target-section extraction. */
export const WHY_RAW_BODY_SCAN_LIMIT = 20_000;

/** PR bodies above this size are skipped when no target section is found. */
export const WHY_MAX_BODY_WITHOUT_TARGET_SECTION = 4_000;

/** Maximum total candidate payload characters sent to the provider. */
export const WHY_MAX_TOTAL_PAYLOAD_CHARS = 12_000;

/** Minimum deterministic trust score before a candidate can reach the model. */
export const WHY_MIN_MODEL_TRUST_SCORE = 5;

/** Minimum deterministic trust score before a model answer can be rendered. */
export const WHY_MIN_RENDER_TRUST_SCORE = 7;
