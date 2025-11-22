// @ts-nocheck
import { describe, test, expect } from '@jest/globals';
import { tuneCategoriesByTitle } from '@/utils/category-tune.js';

describe('category-tune with scoring thresholds', () => {
  test('moves improvement-heavy titles from Chore to Changed', () => {
    const items = [
      { title: 'add pre-processing to improve classification', rawTitle: undefined },
    ];
    const categories = { Chore: ['add pre-processing to improve classification'] };
    const out = tuneCategoriesByTitle(items as any, categories as any);
    expect(out.Changed).toContain('add pre-processing to improve classification');
  });

  test('does not demote explicit Fixed', () => {
    const items = [{ title: 'fix: prevent crash', rawTitle: 'fix: prevent crash' }];
    const categories = { Fixed: ['fix: prevent crash'] };
    const out = tuneCategoriesByTitle(items as any, categories as any);
    expect(out.Fixed).toContain('fix: prevent crash');
  });
});

