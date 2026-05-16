// @ts-nocheck
import { describe, test, expect } from '@jest/globals';
import { scoreCategories, bestCategory } from '@/utils/category-score.js';

describe('category-score', () => {
  test('improve classification favors Changed', () => {
    const title = 'add pre-processing to improve classification';
    const s = scoreCategories(title);
    expect(s.Changed).toBeGreaterThan(s.Added);
    expect(bestCategory(s)).toBe('Changed');
  });

  test('feat adds goes to Added', () => {
    const s = scoreCategories('feat: add new CLI flag');
    expect(bestCategory(s)).toBe('Added');
  });

  test('tighten type goes to Fixed', () => {
    const s = scoreCategories('tighten option type to prevent misuse');
    expect(bestCategory(s)).toBe('Fixed');
  });

  test('refactor streamline goes to Changed', () => {
    const s = scoreCategories('refactor: streamline parsing pipeline');
    expect(bestCategory(s)).toBe('Changed');
  });

  test('revert rollback goes to Reverted', () => {
    const s = scoreCategories('revert: rollback feature');
    expect(bestCategory(s)).toBe('Reverted');
  });

  test('bump major shows Chore with Breaking bonus', () => {
    const s = scoreCategories('chore: bump webpack from 4 to 5');
    expect(s.Chore).toBeGreaterThan(0);
    expect(s['Breaking Changes']).toBeGreaterThan(0);
  });

  test('security CVE goes to Fixed', () => {
    const s = scoreCategories('security: patch CVE-2025-12345');
    expect(bestCategory(s)).toBe('Fixed');
  });

  test('explicit breaking change marker and keywords win over feat prefix', () => {
    const s = scoreCategories('feat!: breaking change drop support for v1 API');
    expect(s['Breaking Changes']).toBeGreaterThan(s.Added);
    expect(bestCategory(s)).toBe('Breaking Changes');
  });

  test('negative uncertainty signal attenuates strongest main category', () => {
    const baseline = scoreCategories('fix: prevent crash in parser');
    const attenuated = scoreCategories(
      'fix: temporary workaround to prevent crash in parser',
    );

    expect(attenuated.Fixed).toBeLessThan(baseline.Fixed);
    expect(bestCategory(attenuated)).toBe('Fixed');
  });

  test('docs prefix and keyword select Docs', () => {
    const s = scoreCategories('docs: update README reference');
    expect(s.Docs).toBeGreaterThan(s.Chore);
    expect(bestCategory(s)).toBe('Docs');
  });
});
