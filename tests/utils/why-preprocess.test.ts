import { describe, expect, test } from '@jest/globals';

import type { PullRequestDetails } from '@/types/github.js';
import type { WhyTarget } from '@/types/why.js';
import { preprocessWhyPrBody } from '@/utils/why-preprocess.js';

const target: WhyTarget = {
  prNumber: 12,
  itemText: 'Restore draft release handling',
  sectionTitle: 'Fixed',
  author: 'alice',
};

function details(overrides: Partial<PullRequestDetails>): PullRequestDetails {
  return {
    number: 12,
    title: 'Restore draft release handling',
    body: '',
    author: 'alice',
    url: 'https://github.com/octo/repo/pull/12',
    ...overrides,
  };
}

describe('why-preprocess', () => {
  test('builds a trusted candidate from explicit why evidence', () => {
    const result = preprocessWhyPrBody(
      target,
      details({
        body: [
          '## Why',
          '',
          'Because draft releases can be created first and published later, the workflow must listen to the publish event.',
        ].join('\n'),
      }),
      { maxCharsPerPr: 800 },
    );

    expect(result.item).toMatchObject({
      prNumber: 12,
      trustBucket: 'medium',
    });
    expect(result.item?.trustScore).toBeGreaterThanOrEqual(7);
    expect(result.item?.candidates.join('\n')).toContain(
      'Because draft releases can be created first',
    );
  });

  test('builds a trusted candidate from a PR template why label block', () => {
    const result = preprocessWhyPrBody(
      target,
      details({
        body: [
          '**Why:**',
          '',
          'Because draft releases can be published later, the changelog workflow must run when publication happens.',
          '',
          'Implementation:',
          'Listen to the release published event.',
        ].join('\n'),
      }),
      { maxCharsPerPr: 800 },
    );

    expect(result.item?.trustScore).toBeGreaterThanOrEqual(7);
    expect(result.item?.candidates.join('\n')).toContain(
      'Because draft releases can be published later',
    );
    expect(result.item?.candidates.join('\n')).not.toContain(
      'Listen to the release published event',
    );
  });

  test('builds a trusted candidate from a bold why label with the colon outside', () => {
    const result = preprocessWhyPrBody(
      target,
      details({
        body: [
          '**Why**:',
          '',
          'Because draft releases can be published later, the changelog workflow must run when publication happens.',
          '',
          'Implementation:',
          'Listen to the release published event.',
        ].join('\n'),
      }),
      { maxCharsPerPr: 800 },
    );

    expect(result.item?.trustScore).toBeGreaterThanOrEqual(7);
    expect(result.item?.candidates.join('\n')).toContain(
      'Because draft releases can be published later',
    );
    expect(result.item?.candidates.join('\n')).not.toContain(
      'Listen to the release published event',
    );
  });

  test('keeps colon-ended rationale intro lines under why labels', () => {
    const result = preprocessWhyPrBody(
      target,
      details({
        body: [
          '**Why:**',
          '',
          'Because of the following:',
          '- draft releases can be published later',
          '- release notes need to be generated at publication time',
          '',
          'Implementation:',
          'Listen to release published events.',
        ].join('\n'),
      }),
      { maxCharsPerPr: 800 },
    );

    const candidates = result.item?.candidates.join('\n') ?? '';

    expect(result.item?.trustScore).toBeGreaterThanOrEqual(7);
    expect(candidates).toContain('Because of the following:');
    expect(candidates).toContain('draft releases can be published later');
    expect(candidates).not.toContain('Listen to release published events');
  });

  test.each(['Why?', '**Why?**', 'Why is this change needed?'])(
    'builds a trusted candidate from question-mark why label %s',
    (label) => {
      const result = preprocessWhyPrBody(
        target,
        details({
          body: [
            label,
            '',
            'Because draft releases can be published later, changelog generation must run at publication time.',
            '',
            'Implementation:',
            'Listen to release published events.',
          ].join('\n'),
        }),
        { maxCharsPerPr: 800 },
      );

      const candidates = result.item?.candidates.join('\n') ?? '';

      expect(result.item?.trustScore).toBeGreaterThanOrEqual(7);
      expect(candidates).toContain(
        'Because draft releases can be published later',
      );
      expect(candidates).not.toContain('Listen to release published events');
    },
  );

  test('keeps a nested why label after heading intro text', () => {
    const result = preprocessWhyPrBody(
      target,
      details({
        body: [
          '## Summary',
          '',
          'This updates the release workflow event handling.',
          '',
          '**Why:**',
          '',
          'Because draft releases can be published later, the changelog workflow must still run at publication time.',
          '',
          'Implementation:',
          'Listen to release published events.',
        ].join('\n'),
      }),
      { maxCharsPerPr: 800 },
    );

    const candidates = result.item?.candidates.join('\n') ?? '';

    expect(result.item?.trustScore).toBeGreaterThanOrEqual(7);
    expect(candidates).toContain(
      'Because draft releases can be published later',
    );
    expect(candidates).not.toContain('release workflow event handling');
    expect(candidates).not.toContain('Listen to release published events');
  });

  test('keeps inline why labels after container label blocks', () => {
    const result = preprocessWhyPrBody(
      target,
      details({
        body: [
          'Summary:',
          'Restore release workflow event handling.',
          '',
          'Why: Because draft releases can be published later, changelog generation must run at publication time.',
          '',
          'Testing:',
          'Verified manually.',
        ].join('\n'),
      }),
      { maxCharsPerPr: 800 },
    );

    const candidates = result.item?.candidates.join('\n') ?? '';

    expect(result.item?.trustScore).toBeGreaterThanOrEqual(7);
    expect(candidates).toContain(
      'Because draft releases can be published later',
    );
    expect(candidates).not.toContain('Why: Because');
    expect(candidates).not.toContain('Verified manually');
  });

  test('preserves parent why text when nested template labels are placeholders', () => {
    const result = preprocessWhyPrBody(
      target,
      details({
        body: [
          '## Why',
          '',
          'Because draft releases can be published later, changelog generation must run on publication.',
          '',
          'Problem:',
          'N/A',
        ].join('\n'),
      }),
      { maxCharsPerPr: 800 },
    );

    const candidates = result.item?.candidates.join('\n') ?? '';

    expect(result.item?.trustScore).toBeGreaterThanOrEqual(7);
    expect(candidates).toContain(
      'Because draft releases can be published later',
    );
    expect(candidates).not.toContain('N/A');
  });

  test('does not score placeholder why labels as structural trust', () => {
    const result = preprocessWhyPrBody(
      target,
      details({
        body: [
          '**Why:**',
          'N/A',
          '',
          '**Summary:**',
          'Fix release workflow so changelog generation runs reliably for publication.',
        ].join('\n'),
      }),
      { maxCharsPerPr: 800 },
    );

    expect(result.item?.trustScore ?? 0).toBeLessThan(7);
    expect(result.item?.candidates.join('\n') ?? '').not.toContain('N/A');
  });

  test('does not fallback after a placeholder inline why label', () => {
    const result = preprocessWhyPrBody(
      target,
      details({
        body: [
          'Why: N/A',
          '',
          'Implementation:',
          'Because this fixes a release workflow regression, changelog generation must rerun when drafts are published.',
        ].join('\n'),
      }),
      { maxCharsPerPr: 800 },
    );

    expect(result.item).toBeUndefined();
    expect(result.lowTrust).toBe(true);
    expect(result.skippedReason).toContain('no usable WHY candidate');
  });

  test.each([
    ['## Why?', 'Because draft releases need the publish event.'],
    [
      '## Why is this change needed?',
      'Because release operators publish drafts later and need changelog coverage at that point.',
    ],
    [
      '## ¿Por qué?',
      'Porque las versiones draft necesitan el evento de publicación.',
    ],
  ])('recognizes punctuated why heading %s', (heading, rationale) => {
    const result = preprocessWhyPrBody(
      target,
      details({ body: [heading, '', rationale].join('\n') }),
      { maxCharsPerPr: 800 },
    );

    expect(result.item?.trustScore).toBeGreaterThanOrEqual(7);
    expect(result.item?.candidates).toContain(rationale);
  });

  test('builds a trusted candidate from a collapsible summary section', () => {
    const result = preprocessWhyPrBody(
      target,
      details({
        body: [
          '<details>',
          '<summary>Why</summary>',
          '',
          'Because release maintainers need the changelog update to happen when a draft is published.',
          '</details>',
        ].join('\n'),
      }),
      { maxCharsPerPr: 800 },
    );

    expect(result.item?.trustScore).toBeGreaterThanOrEqual(7);
    expect(result.item?.candidates.join('\n')).toContain(
      'Because release maintainers need the changelog update',
    );
  });

  test('skips placeholder-only why sections before provider input', () => {
    const result = preprocessWhyPrBody(
      target,
      details({
        body: [
          '## Why',
          '',
          '_No response_',
          '',
          '## Implementation',
          'None',
        ].join('\n'),
      }),
      { maxCharsPerPr: 800 },
    );

    expect(result.item).toBeUndefined();
    expect(result.lowTrust).toBe(true);
    expect(result.skippedReason).toContain('no usable WHY candidate');
  });

  test('does not use the next template field when a why label is empty', () => {
    const result = preprocessWhyPrBody(
      target,
      details({
        body: [
          '**Why:**',
          '',
          'Implementation:',
          'Because this fixes the release event listener.',
          '',
          'Testing:',
          'Verified manually.',
        ].join('\n'),
      }),
      { maxCharsPerPr: 800 },
    );

    expect(result.item).toBeUndefined();
    expect(result.lowTrust).toBe(true);
    expect(result.skippedReason).toContain('no usable WHY candidate');
  });

  test.each(['**Implementation:**', '__Testing:__', '**Implementation**:'])(
    'does not boost summary text with empty why before bold template field %s',
    (templateLabel) => {
      const result = preprocessWhyPrBody(
        target,
        details({
          body: [
            '**Why:**',
            '',
            templateLabel,
            'Because this fixes the release event listener.',
            '',
            '**Summary:**',
            'Fix release workflow so changelog generation runs reliably for publication.',
          ].join('\n'),
        }),
        { maxCharsPerPr: 800 },
      );

      const candidates = result.item?.candidates.join('\n') ?? '';

      expect(result.item?.trustScore ?? 0).toBeLessThan(7);
      expect(candidates).toContain('Fix release workflow');
      expect(candidates).not.toContain('Because this fixes');
    },
  );

  test('does not use the next template field when a why heading is empty', () => {
    const result = preprocessWhyPrBody(
      target,
      details({
        body: [
          '## Why',
          '',
          'Implementation:',
          'Because this fixes the release event listener.',
          '',
          'Testing:',
          'Verified manually.',
        ].join('\n'),
      }),
      { maxCharsPerPr: 800 },
    );

    expect(result.item).toBeUndefined();
    expect(result.lowTrust).toBe(true);
    expect(result.skippedReason).toContain('no usable WHY candidate');
  });

  test('skips large bodies without target sections before provider input', () => {
    const result = preprocessWhyPrBody(
      target,
      details({ body: 'Implementation notes.\n'.repeat(500) }),
      { maxCharsPerPr: 800 },
    );

    expect(result.item).toBeUndefined();
    expect(result.lowTrust).toBe(true);
    expect(result.skippedReason).toContain(
      'PR description too large without target section',
    );
  });

  test('keeps scanning fallback bodies after generic template labels', () => {
    const result = preprocessWhyPrBody(
      target,
      details({
        body: [
          'Notes:',
          'Because this fixes a release workflow regression, changelog generation must rerun when drafts are published.',
        ].join('\n'),
      }),
      { maxCharsPerPr: 800 },
    );

    const candidates = result.item?.candidates.join('\n') ?? '';

    expect(result.item?.trustScore).toBeGreaterThanOrEqual(5);
    expect(candidates).toContain('Because this fixes');
    expect(candidates).not.toContain('Notes:');
  });

  test('allows non-English candidate bodies to reach provider judgment', () => {
    const result = preprocessWhyPrBody(
      target,
      details({
        body: [
          '## 理由',
          '',
          'ドラフトリリースを後から公開する運用でも、公開時に changelog PR を作れるようにするため。',
        ].join('\n'),
      }),
      { maxCharsPerPr: 800 },
    );

    expect(result.item?.trustScore).toBeGreaterThanOrEqual(7);
    expect(result.item?.candidates.join('\n')).toContain(
      'ドラフトリリースを後から公開する運用',
    );
  });

  test('requires high confidence for non-English candidates without strong structure', () => {
    const result = preprocessWhyPrBody(
      target,
      details({
        body: 'ドラフトリリースを後から公開する運用でも、公開時に変更履歴 PR を作れるようにするため。利用者がリリース後に変更内容を確認できるようにする。',
      }),
      { maxCharsPerPr: 800 },
    );

    expect(result.item?.trustScore).toBeGreaterThanOrEqual(7);
    expect(result.item?.requiresHighConfidence).toBe(true);
  });

  test('normalizes localized section headings across languages', () => {
    const spanish = preprocessWhyPrBody(
      target,
      details({
        body: [
          '## Razón',
          '',
          'Porque las versiones draft se publican más tarde y necesitan el mismo flujo de changelog.',
        ].join('\n'),
      }),
      { maxCharsPerPr: 800 },
    );
    const german = preprocessWhyPrBody(
      target,
      details({
        body: [
          '## Begründung',
          '',
          'Damit veröffentlichte Draft-Releases denselben Changelog-Pfad verwenden können.',
        ].join('\n'),
      }),
      { maxCharsPerPr: 800 },
    );

    expect(spanish.item?.trustScore).toBeGreaterThanOrEqual(7);
    expect(spanish.item?.candidates.join('\n')).toContain('versiones draft');
    expect(german.item?.trustScore).toBeGreaterThanOrEqual(7);
    expect(german.item?.requiresHighConfidence).toBe(false);
    expect(german.item?.candidates.join('\n')).toContain('Draft-Releases');
  });

  test('skips dependency update PRs even when a body exists', () => {
    const result = preprocessWhyPrBody(
      target,
      details({
        title: 'Bump vite from 5.0.0 to 5.1.0',
        body: '## Why\nBecause the dependency was released.',
      }),
      { maxCharsPerPr: 800 },
    );

    expect(result.item).toBeUndefined();
    expect(result.lowTrust).toBe(false);
    expect(result.skippedReason).toContain('automatic maintenance PR');
  });
});
