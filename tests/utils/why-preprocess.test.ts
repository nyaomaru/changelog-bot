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

  test.each([
    ['## Why?', 'Because draft releases need the publish event.'],
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
