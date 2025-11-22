import { describe, test, expect } from '@jest/globals';
import { tuneCategoriesByTitle } from '@/utils/category-tune.js';
import type { CategoryMap, Item } from '@/utils/category-tune.js';

describe('category-tune with scoring thresholds', () => {
  test('moves improvement-heavy titles from Chore to Changed', () => {
    const items: Item[] = [
      { title: 'add pre-processing to improve classification', rawTitle: undefined },
    ];
    const categories: CategoryMap = { Chore: ['add pre-processing to improve classification'] };
    const out = tuneCategoriesByTitle(items, categories);
    expect(out.Changed).toContain('add pre-processing to improve classification');
  });

  test('does not demote explicit Fixed', () => {
    const items: Item[] = [{ title: 'fix: prevent crash', rawTitle: 'fix: prevent crash' }];
    const categories: CategoryMap = { Fixed: ['fix: prevent crash'] };
    const out = tuneCategoriesByTitle(items, categories);
    expect(out.Fixed).toContain('fix: prevent crash');
  });
});

