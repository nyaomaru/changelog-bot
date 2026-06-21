import { describe, expect, test } from '@jest/globals';

import { parseWhyBullet } from '@/utils/why-pr-reference.js';

const repository = { owner: 'octo', repo: 'repo' };

describe('why-pr-reference', () => {
  test('parses and removes current-repository PR metadata', () => {
    const parsed = parseWhyBullet(
      '- Fix release lookup by @alice in [#42](https://github.com/octo/repo/pull/42)',
      repository,
    );

    expect(parsed).toEqual({
      prNumber: 42,
      itemText: 'Fix release lookup',
      author: 'alice',
    });
  });

  test.each(['- Fix release lookup in #42', '- Fix release lookup (#42)'])(
    'accepts generated numeric suffixes: %s',
    (line) => {
      expect(parseWhyBullet(line, repository)).toMatchObject({
        prNumber: 42,
        itemText: 'Fix release lookup',
      });
    },
  );

  test('rejects an external repository PR link', () => {
    const parsed = parseWhyBullet(
      '- Sync behavior with https://github.com/upstream/repo/pull/42',
      repository,
    );

    expect(parsed).toBeNull();
  });
});
