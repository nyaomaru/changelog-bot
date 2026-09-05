// @ts-nocheck
import { describe, test, expect } from '@jest/globals';
import { buildChangesForClassification } from '@/utils/classify-pre.js';

function releaseNoteChange(index, title, rawTitle) {
  return {
    id: `release-note:${index}`,
    origin: { kind: 'release-note', index },
    title,
    rawTitle,
  };
}

describe('classify-pre with scoring', () => {
  test('guides to refactor for improvement titles', () => {
    const items = [
      releaseNoteChange(0, 'add pre-processing to improve classification'),
    ];
    const out = buildChangesForClassification(items);
    expect(out[0].title).toMatch(/^refactor:/);
    expect(out[0].id).toBe('release-note:0');
  });

  test('guides to fix for tighten type', () => {
    const items = [
      releaseNoteChange(0, 'tighten option type to prevent misuse'),
    ];
    const out = buildChangesForClassification(items);
    expect(out[0].title).toMatch(/^fix:/);
  });

  test('keeps explicit feat', () => {
    const items = [
      releaseNoteChange(0, 'feat: add option', 'feat: add option'),
    ];
    const out = buildChangesForClassification(items);
    expect(out[0].title).toBe('feat: add option');
  });
});
