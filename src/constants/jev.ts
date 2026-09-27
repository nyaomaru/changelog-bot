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
