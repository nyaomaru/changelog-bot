import { describe, expect, test } from '@jest/globals';
import { isDependencyUpdateTitle } from '@/utils/dependency-update.js';

describe('isDependencyUpdateTitle', () => {
  test('detects conventional deps scope updates', () => {
    expect(
      isDependencyUpdateTitle(
        'chore(deps): Update dependency prettier to v3.8.0 #113',
      ),
    ).toBe(true);
    expect(
      isDependencyUpdateTitle(
        'chore(deps-dev): bump @types/node from 18 to 20',
      ),
    ).toBe(true);
  });

  test('detects dependency keywords with action and version hints', () => {
    expect(isDependencyUpdateTitle('deps: update lockfile')).toBe(true);
    expect(
      isDependencyUpdateTitle('chore: bump dependency lodash from 4 to 5'),
    ).toBe(true);
  });

  test('ignores non-dependency updates without version hints', () => {
    expect(isDependencyUpdateTitle('chore: update dependency resolver')).toBe(
      false,
    );
    expect(isDependencyUpdateTitle('docs: update README')).toBe(false);
  });
});
