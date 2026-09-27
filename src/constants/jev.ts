/** Stable identifier for the experimental TypeSafe Jev WHY engine. */
export const JEV_WHY_ENGINE_NAME = 'jev';

/** Minimum explicit-rationale probability required to accept a candidate. */
export const JEV_MIN_EXPLICIT_WHY_PROBABILITY = 0.5;

/** Minimum change-relevance probability required to accept a candidate. */
export const JEV_MIN_CHANGE_RELEVANCE_PROBABILITY = 0.5;

/** Combined probability at which Jev maps a selection to medium confidence. */
export const JEV_MEDIUM_CONFIDENCE_PROBABILITY = 0.6;

/** Combined probability at which Jev maps a selection to high confidence. */
export const JEV_HIGH_CONFIDENCE_PROBABILITY = 0.8;

/** Experimental thresholds reported by the Jev evaluation runner. */
export const JEV_EVALUATION_THRESHOLDS = [
  JEV_MIN_EXPLICIT_WHY_PROBABILITY,
  JEV_MEDIUM_CONFIDENCE_PROBABILITY,
  JEV_HIGH_CONFIDENCE_PROBABILITY,
] as const;

/** Fine-grained probability steps for threshold sweep calibration. */
export const JEV_CALIBRATION_SWEEP_THRESHOLDS = [
  0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9,
] as const;
