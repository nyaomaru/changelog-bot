// eslint-disable @typescript-eslint/no-explicit-any -- Tests may coerce types when focusing on behavior, not type surfaces.
import { tuneCategoriesByTitle } from '@/utils/category-tune.js';
import type { ReleaseItem } from '@/types/release.js';
import type { CategoryMap } from '@/types/changelog.js';

describe('tuneCategoriesByTitle', () => {
  test('moves conventional fix-like titles to Fixed', () => {
    const items: ReleaseItem[] = [
      { title: 'tighten option type', rawTitle: 'chore: tighten option type' },
    ];
    const categories: CategoryMap = { Chore: ['chore: tighten option type'] };
    const out = tuneCategoriesByTitle(items, categories);
    expect(out.Fixed).toContain('chore: tighten option type');
  });

  test('moves refactor-like titles to Changed', () => {
    const items: ReleaseItem[] = [
      {
        title: 'refactor: internal pipeline',
        rawTitle: 'refactor: internal pipeline',
      },
    ];
    const categories: CategoryMap = { Chore: ['refactor: internal pipeline'] };
    const out = tuneCategoriesByTitle(items, categories);
    expect(out.Changed).toContain('refactor: internal pipeline');
  });

  test('moves feat: titles to Added', () => {
    const items: ReleaseItem[] = [
      {
        title: 'Support GitHub App auth',
        rawTitle: 'feat: Support GitHub App auth',
      },
    ];
    const categories: CategoryMap = {
      Chore: ['feat: Support GitHub App auth'],
    };
    const out = tuneCategoriesByTitle(items, categories);
    expect(out.Added).toContain('feat: Support GitHub App auth');
    // Ensure it is removed from Chore
    expect(out.Chore?.includes('feat: Support GitHub App auth')).toBeFalsy();
  });

  test('matches feat(scope)!: and fix(scope)!: forms', () => {
    const items: ReleaseItem[] = [
      { title: 'Breaking feature', rawTitle: 'feat(core)!: new something' },
      { title: 'Critical fix', rawTitle: 'fix(api)!: patch issue' },
    ];
    const categories: CategoryMap = {
      Chore: ['feat(core)!: new something', 'fix(api)!: patch issue'],
    };
    const out = tuneCategoriesByTitle(items, categories);
    expect(out.Added).toContain('feat(core)!: new something');
    expect(out.Fixed).toContain('fix(api)!: patch issue');
  });
});
