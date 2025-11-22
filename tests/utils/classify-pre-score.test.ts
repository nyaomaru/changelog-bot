import { describe, test, expect } from '@jest/globals';
import { buildTitlesForClassification } from '@/utils/classify-pre.js';
import type { ReleaseItem } from '@/types/release.js';

describe('classify-pre with scoring', () => {
  test('guides to refactor for improvement titles', () => {
    const items: ReleaseItem[] = [
      { title: 'add pre-processing to improve classification', rawTitle: undefined },
    ];
    const out = buildTitlesForClassification(items);
    expect(out[0]).toMatch(/^refactor:/);
  });

  test('guides to fix for tighten type', () => {
    const items: ReleaseItem[] = [
      { title: 'tighten option type to prevent misuse', rawTitle: undefined },
    ];
    const out = buildTitlesForClassification(items);
    expect(out[0]).toMatch(/^fix:/);
  });

  test('keeps explicit feat', () => {
    const items: ReleaseItem[] = [{ title: 'feat: add option', rawTitle: 'feat: add option' }];
    const out = buildTitlesForClassification(items);
    expect(out[0]).toBe('feat: add option');
  });
});

