// WHY: Keep tunable heuristic data separate from the scoring algorithm so
// weight changes can be reviewed without navigating score-control flow.
export const WEIGHT_LEVEL = {
  low: 2,
  default: 3,
  high: 4,
  veryHigh: 5,
} as const;

const NEGATIVE_LEVEL = {
  mild: -1,
  medium: -2,
  strong: -3,
} as const;

export const WEIGHT = {
  prefix: {
    breaking: WEIGHT_LEVEL.veryHigh,
    feat: WEIGHT_LEVEL.high,
    fix: WEIGHT_LEVEL.high,
    refactor: WEIGHT_LEVEL.default,
    perf: WEIGHT_LEVEL.default,
    style: WEIGHT_LEVEL.low,
    docs: WEIGHT_LEVEL.default,
    test: WEIGHT_LEVEL.default,
    revert: WEIGHT_LEVEL.high,
    chore: WEIGHT_LEVEL.low,
  },
  strong: {
    default: WEIGHT_LEVEL.default,
    high: WEIGHT_LEVEL.high,
    veryHigh: WEIGHT_LEVEL.veryHigh,
  },
  negative: {
    mild: NEGATIVE_LEVEL.mild,
    medium: NEGATIVE_LEVEL.medium,
    strong: NEGATIVE_LEVEL.strong,
  },
} as const;

export type WeightedKeyword =
  | string
  | { readonly keyword: string; readonly weight: number };

/** Default keyword and prefix weights used by the scoring heuristic. */
export const CATEGORY_WEIGHTS = {
  prefix: {
    breaking: WEIGHT.prefix.breaking,
    feat: WEIGHT.prefix.feat,
    fix: WEIGHT.prefix.fix,
    refactor: WEIGHT.prefix.refactor,
    perf: WEIGHT.prefix.perf,
    style: WEIGHT.prefix.style,
    docs: WEIGHT.prefix.docs,
    test: WEIGHT.prefix.test,
    revert: WEIGHT.prefix.revert,
    chore: WEIGHT.prefix.chore,
  },
  strong: {
    breaking: [
      { keyword: 'breaking change', weight: WEIGHT.strong.veryHigh },
      { keyword: 'incompatible', weight: WEIGHT.strong.high },
      { keyword: 'remove support', weight: WEIGHT.strong.high },
      { keyword: 'drop support', weight: WEIGHT.strong.high },
      { keyword: 'deprecate', weight: WEIGHT.strong.default },
      { keyword: 'removal', weight: WEIGHT.strong.default },
      { keyword: 'api change', weight: WEIGHT.strong.default },
    ],
    added: [
      'add',
      'introduce',
      'implement',
      'support',
      'enable',
      'expose',
      'create',
      'new',
      'initial',
      'opt in',
      'integrate',
    ],
    fixed: [
      { keyword: 'regression', weight: WEIGHT.strong.high },
      { keyword: 'crash', weight: WEIGHT.strong.high },
      'fix',
      'bug',
      'prevent',
      'correct',
      'wrong',
      'invalid',
      'incorrect',
      'mismatch',
      'error',
      'null',
      'undefined',
      'edge case',
      'panic',
      { keyword: 'security', weight: WEIGHT.strong.high },
      { keyword: 'vuln', weight: WEIGHT.strong.high },
      { keyword: 'cve', weight: WEIGHT.strong.veryHigh },
      { keyword: 'xss', weight: WEIGHT.strong.veryHigh },
      { keyword: 'csrf', weight: WEIGHT.strong.veryHigh },
      { keyword: 'rce', weight: WEIGHT.strong.veryHigh },
      { keyword: 'dos', weight: WEIGHT.strong.veryHigh },
    ],
    changed: [
      'improve',
      'improvement',
      'optimize',
      'optimization',
      'refine',
      'refinement',
      'streamline',
      'simplify',
      'polish',
      'rework',
      'revise',
      'revamp',
      'stabilize',
      'harden',
      'tuning',
      'fine tune',
      'adjust',
      'tweak',
    ],
    docs: ['docs', 'readme', 'guide', 'tutorial', 'reference', 'comment'],
    test: [
      'test',
      'tests',
      'e2e',
      'integration',
      'unit',
      'snapshot',
      'coverage',
      'mock',
      'fixture',
    ],
    chore: [
      'build',
      'pipeline',
      'workflow',
      'actions',
      'release',
      'packaging',
      'publish',
      'bundler',
      'transpile',
      'tsconfig',
      'vite',
      'webpack',
      'rollup',
      'lockfile',
      'cache',
      'cleanup',
      'housekeeping',
      'maintenance',
      'format',
      'prettier',
      'eslint',
      'lint',
    ],
  },
  weak: {
    added: [
      'allow',
      'add on',
      'hook',
      'wire',
      'default flag',
      'parameter',
      'option',
    ],
    fixed: ['mitigate', 'patch', 'guard', 'handle'],
    changed: [
      'tune',
      'retune',
      'calibrate',
      'rearrange',
      'reorganize',
      'restructure',
    ],
    docs: ['typo', 'wording', 'rename section', 'rename header'],
    chore: ['bump', 'upgrade', 'pin', 'deps', 'dependency'],
  },
  negative: [
    { keyword: 'workaround', weight: WEIGHT.negative.medium },
    { keyword: 'temporary', weight: WEIGHT.negative.medium },
    { keyword: 'hack', weight: WEIGHT.negative.medium },
    { keyword: 'wip', weight: WEIGHT.negative.strong },
    { keyword: 'experimental', weight: WEIGHT.negative.mild },
  ],
} satisfies {
  prefix: Record<string, number>;
  strong: Record<string, readonly WeightedKeyword[]>;
  weak: Record<string, readonly WeightedKeyword[]>;
  negative: readonly Exclude<WeightedKeyword, string>[];
};

export const SCORE_MIN = 0;
export const SCORE_MAX = 12;
export const BEST_CATEGORY_MIN_SCORE = 4;
export const BEST_CATEGORY_REQUIRED_MARGIN = 2;
export const WEAK_KEYWORD_WEIGHT = 1;
export const NEGATIVE_ATTENUATION_WEIGHT = 1;
export const NGRAM_MAX_WORDS = 50;

/** Thresholds for interpreting category scores. */
export const SCORE_THRESHOLDS = {
  fixed: 4,
  changed: 4,
  added: 4,
  breaking: 6,
} as const;
