// @ts-nocheck
import { describe, test, expect } from '@jest/globals';
import { tuneCategoriesByTitle } from '@/utils/category-tune.js';

describe('tuneCategoriesByTitle', () => {
  test('moves conventional fix-like titles to Fixed', () => {
    const items = [
      { title: 'tighten option type', rawTitle: 'chore: tighten option type' },
    ];
    const categories = { Chore: ['chore: tighten option type'] };
    const out = tuneCategoriesByTitle(items as any, categories as any);
    expect(out.Fixed).toContain('chore: tighten option type');
  });

  test('moves refactor-like titles to Changed', () => {
    const items = [{ title: 'refactor: internal pipeline', rawTitle: 'refactor: internal pipeline' }];
    const categories = { Chore: ['refactor: internal pipeline'] };
    const out = tuneCategoriesByTitle(items as any, categories as any);
    expect(out.Changed).toContain('refactor: internal pipeline');
  });

  test('moves feat: titles to Added', () => {
    const items = [
      { title: 'Support GitHub App auth', rawTitle: 'feat: Support GitHub App auth' },
    ];
    const categories = { Chore: ['feat: Support GitHub App auth'] };
    const out = tuneCategoriesByTitle(items as any, categories as any);
    expect(out.Added).toContain('feat: Support GitHub App auth');
    // Ensure it is removed from Chore
    expect(out.Chore?.includes('feat: Support GitHub App auth')).toBeFalsy();
  });
});

