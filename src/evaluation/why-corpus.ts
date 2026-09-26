import type { WhyEvaluationCase } from '@/evaluation/why-evaluation.js';

/**
 * Labeled PR-description candidates for evaluating experimental WHY extractors.
 * WHY: The corpus includes both repository PRs and adversarial fixtures so
 * confidence thresholds are measured against explicit and misleading evidence.
 */
export const WHY_EVALUATION_CORPUS: WhyEvaluationCase[] = [
  {
    id: 'pr-203-explicit-rationale-section',
    sourcePullRequest: 203,
    item: {
      prNumber: 203,
      title: 'feat(why): add experimental Jev Noul selection engine',
      itemText: 'Add experimental Jev Noul selection engine',
      sectionTitle: 'Added',
      trustScore: 10,
      trustBucket: 'high',
      requiresHighConfidence: false,
      candidates: [
        'Jev is well suited to confidence-aware candidate selection, but it cannot generate the free-form WHY prose expected by the existing provider contract. Keeping it as a dedicated WHY engine lets us evaluate its decision quality without changing changelog generation or weakening the evidence requirement.',
      ],
    },
    expectedSelectedCandidateIndex: 0,
  },
  {
    id: 'pr-185-description-outcome',
    sourcePullRequest: 185,
    item: {
      prNumber: 185,
      title: 'refactor: separate changelog run phase',
      itemText: 'Separate changelog run phase',
      sectionTitle: 'Changed',
      trustScore: 9,
      trustBucket: 'high',
      requiresHighConfidence: false,
      candidates: [
        'Separate changelog execution into input-resolution and output-finalization phases.',
        'This simplifies the main orchestration flow, runs independent GitHub lookups concurrently, and adds coverage for WHY enrichment finalization.',
      ],
    },
    expectedSelectedCandidateIndex: 1,
  },
  {
    id: 'pr-166-prevents-false-positives',
    sourcePullRequest: 166,
    item: {
      prNumber: 166,
      title: 'feat: extract WHY from description sections',
      itemText: 'Extract WHY from description sections',
      sectionTitle: 'Added',
      trustScore: 9,
      trustBucket: 'high',
      requiresHighConfidence: false,
      candidates: [
        'Extract explicit rationale from Description sections using markers such as WHY:, because, and in order to.',
        'Keep generic description prose below the trust threshold to prevent false positives.',
        'Document the behavior and add regression coverage.',
      ],
    },
    expectedSelectedCandidateIndex: 1,
  },
  {
    id: 'pr-197-implementation-only',
    sourcePullRequest: 197,
    item: {
      prNumber: 197,
      title: 'refactor(providers): share common provider configuration',
      itemText: 'Share common provider configuration',
      sectionTitle: 'Changed',
      trustScore: 7,
      trustBucket: 'medium',
      requiresHighConfidence: false,
      candidates: [
        'Extract shared provider runtime configuration and capability initialization into ProviderBase.',
        'Refactor OpenAI, Anthropic, and Gemini adapters to inherit it while preserving their provider-specific API behavior.',
      ],
    },
    expectedSelectedCandidateIndex: null,
  },
  {
    id: 'pr-192-implementation-list',
    sourcePullRequest: 192,
    item: {
      prNumber: 192,
      title: 'refactor: classify release changes by stable ID',
      itemText: 'Classify release changes by stable ID',
      sectionTitle: 'Changed',
      trustScore: 7,
      trustBucket: 'medium',
      requiresHighConfidence: false,
      candidates: [
        'Replace category-to-title classification with ID-to-category assignments.',
        'Update OpenAI, Anthropic, and Gemini providers to classify canonical release changes.',
        'Reject unknown change IDs and unsupported categories.',
      ],
    },
    expectedSelectedCandidateIndex: null,
  },
  {
    id: 'pr-171-implementation-list',
    sourcePullRequest: 171,
    item: {
      prNumber: 171,
      title: 'refactor: separate release and WHY responsibilities',
      itemText: 'Separate release and WHY responsibilities',
      sectionTitle: 'Changed',
      trustScore: 7,
      trustBucket: 'medium',
      requiresHighConfidence: false,
      candidates: [
        'Separate category-scoring configuration from scoring logic.',
        'Split release-note parsing, Markdown handling, PR item mapping, and rendering.',
        'Split WHY candidate extraction, trust evaluation, PR detail collection, and note rendering.',
      ],
    },
    expectedSelectedCandidateIndex: null,
  },
  {
    id: 'pr-155-template-extraction-implementation-list',
    sourcePullRequest: 155,
    item: {
      prNumber: 155,
      title: 'Improve WHY template extraction',
      itemText: 'Improve WHY template extraction',
      sectionTitle: 'Added',
      trustScore: 8,
      trustBucket: 'medium',
      requiresHighConfidence: false,
      candidates: [
        'Recognize PR template WHY label blocks, support question-style headings and collapsible Why sections, and filter placeholder/template noise before sending candidates to the provider.',
      ],
    },
    expectedSelectedCandidateIndex: null,
  },
  {
    id: 'pr-128-release-heading-implementation-list',
    sourcePullRequest: 128,
    item: {
      prNumber: 128,
      title: 'Normalize nested release-note headings',
      itemText: 'Normalize nested release-note headings',
      sectionTitle: 'Fixed',
      trustScore: 8,
      trustBucket: 'medium',
      requiresHighConfidence: false,
      candidates: [
        'Normalize stray prefixes before release-note headings, preserve H2 section boundaries, and demote nested headings while rendering CHANGELOG.md.',
      ],
    },
    expectedSelectedCandidateIndex: null,
  },
  {
    id: 'pr-122-config-implementation-list',
    sourcePullRequest: 122,
    item: {
      prNumber: 122,
      title: 'Add config file support',
      itemText: 'Add config file support',
      sectionTitle: 'Added',
      trustScore: 8,
      trustBucket: 'medium',
      requiresHighConfidence: false,
      candidates: [
        'Load changelog-bot.config.json by default, let CLI flags override it, validate unknown keys strictly, and pass config-path through Action inputs.',
      ],
    },
    expectedSelectedCandidateIndex: null,
  },
  {
    id: 'pr-131-reliability-controls-implementation-list',
    sourcePullRequest: 131,
    item: {
      prNumber: 131,
      title: 'Add reliability controls',
      itemText: 'Add reliability controls',
      sectionTitle: 'Added',
      trustScore: 8,
      trustBucket: 'medium',
      requiresHighConfidence: false,
      candidates: [
        'Add --no-ai, --require-provider, and --fail-on-llm-error; add dry-run diagnostics; strengthen mocked integration coverage; and document the options.',
      ],
    },
    expectedSelectedCandidateIndex: null,
  },
  {
    id: 'pr-135-optional-label-permission-outcome',
    sourcePullRequest: 135,
    item: {
      prNumber: 135,
      title: 'Make PR labeling permission optional',
      itemText: 'Make PR labeling permission optional',
      sectionTitle: 'Fixed',
      trustScore: 9,
      trustBucket: 'high',
      requiresHighConfidence: false,
      candidates: [
        'Keep changelog PR creation successful when label application is denied because the workflow lacks issues: write permission.',
      ],
    },
    expectedSelectedCandidateIndex: 0,
  },
  {
    id: 'fixture-japanese-explicit-rationale',
    item: {
      prNumber: 90_001,
      title: 'ドラフトリリースの公開処理を修正',
      itemText: 'ドラフトリリースの公開処理を修正',
      sectionTitle: 'Fixed',
      trustScore: 9,
      trustBucket: 'high',
      requiresHighConfidence: false,
      candidates: [
        'ドラフトリリースを後から公開する運用でも、公開時に変更履歴 PR を作れるようにするため。',
      ],
    },
    expectedSelectedCandidateIndex: 0,
  },
  {
    id: 'fixture-unrelated-explicit-rationale',
    item: {
      prNumber: 90_002,
      title: 'Fix cache invalidation',
      itemText: 'Fix cache invalidation',
      sectionTitle: 'Fixed',
      trustScore: 8,
      trustBucket: 'medium',
      requiresHighConfidence: false,
      candidates: [
        'Because release notes need Japanese translations, the documentation workflow must run after publication.',
      ],
    },
    expectedSelectedCandidateIndex: null,
  },
  {
    id: 'fixture-japanese-implementation-only',
    item: {
      prNumber: 90_003,
      title: 'リリースイベント処理を更新',
      itemText: 'リリースイベント処理を更新',
      sectionTitle: 'Changed',
      trustScore: 8,
      trustBucket: 'medium',
      requiresHighConfidence: false,
      candidates: [
        'リリース公開イベントを受け取る処理と設定ファイルの項目を更新した。',
      ],
    },
    expectedSelectedCandidateIndex: null,
  },
];
