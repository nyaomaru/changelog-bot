// @ts-nocheck
import { describe, test, expect } from '@jest/globals';
import {
  stripConventionalPrefix,
  normalizeTitle,
} from '@/utils/title-normalize.js';

describe('title-normalize', () => {
  describe('stripConventionalPrefix', () => {
    test('removes simple type prefix', () => {
      expect(stripConventionalPrefix('feat: add feature')).toBe('add feature');
      expect(stripConventionalPrefix('fix: bug')).toBe('bug');
    });

    test('handles breaking ! before colon', () => {
      expect(stripConventionalPrefix('feat!: breaking change')).toBe(
        'breaking change',
      );
      expect(stripConventionalPrefix('fix!: critical fix')).toBe(
        'critical fix',
      );
    });

    test('handles scope and ! after scope', () => {
      expect(stripConventionalPrefix('feat(core)!: new api')).toBe('new api');
      expect(stripConventionalPrefix('fix(api)!: patch')).toBe('patch');
      expect(stripConventionalPrefix('docs(readme): update')).toBe('update');
    });
  });

  describe('normalizeTitle', () => {
    test('lowercases, strips prefix and punctuation', () => {
      expect(normalizeTitle('feat: Add feature!')).toBe('add feature');
      expect(normalizeTitle('fix(core)!: Handle A/B')).toBe('handle a b');
    });

    test('collapses multiple separators and trims', () => {
      expect(normalizeTitle('feat:   Add   feature   ')).toBe('add feature');
      expect(normalizeTitle('refactor: pipeline 2.0')).toBe('pipeline 2 0');
    });
  });
});
