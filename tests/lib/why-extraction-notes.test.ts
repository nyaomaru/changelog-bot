import { describe, expect, test } from '@jest/globals';
import {
  acceptWhyNotes,
  appendWhyPreview,
  githubWebHost,
} from '@/lib/why-extraction-notes.js';
import type { WhyExtractionItem, WhyExtractionOutput } from '@/types/why.js';

describe('acceptWhyNotes', () => {
  const singleItem: WhyExtractionItem = {
    prNumber: 42,
    changeId: 'pr:42',
    itemText: 'add feature X',
    sectionTitle: 'Added',
    title: 'feat: add feature X',
    candidates: ['Motivation: X is needed.'],
    trustScore: 10,
    trustBucket: 'high',
    requiresHighConfidence: false,
  };

  const subChange1: WhyExtractionItem = {
    prNumber: 100,
    changeId: 'pr:100:c1',
    itemText: 'add OAuth provider',
    sectionTitle: 'Added',
    title: 'feat: add OAuth provider',
    candidates: ['Rationale 1: SSO integration.'],
    trustScore: 10,
    trustBucket: 'high',
    requiresHighConfidence: false,
  };

  const subChange2: WhyExtractionItem = {
    prNumber: 100,
    changeId: 'pr:100:c2',
    itemText: 'fix session race condition',
    sectionTitle: 'Fixed',
    title: 'fix: resolve race condition in token refresh',
    candidates: ['Rationale 2: Prevent disconnects.'],
    trustScore: 10,
    trustBucket: 'high',
    requiresHighConfidence: false,
  };

  test('accepts note for single-target PR when changeId is omitted (backward compatibility)', () => {
    const providerOutput: WhyExtractionOutput = {
      items: [
        {
          prNumber: 42,
          why: 'Enables user customization.',
          confidence: 'high',
        },
      ],
    };

    const result = acceptWhyNotes(providerOutput, [singleItem], 'medium');
    expect(result.skippedLowTrust).toBe(0);
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]).toMatchObject({
      prNumber: 42,
      changeId: 'pr:42',
      why: 'Enables user customization.',
      sectionTitle: 'Added',
    });
  });

  test('rejects note when single-target PR provides a mismatched changeId belonging to another PR', () => {
    const providerOutput: WhyExtractionOutput = {
      items: [
        {
          prNumber: 42,
          changeId: 'pr:99:c1',
          why: 'Enables user customization.',
          confidence: 'high',
        },
      ],
    };

    const result = acceptWhyNotes(providerOutput, [singleItem], 'medium');
    expect(result.notes).toHaveLength(0);
  });

  test('rejects notes when a multi-target PR omits changeId (requires matching changeId)', () => {
    const providerOutput: WhyExtractionOutput = {
      items: [
        {
          prNumber: 100,
          why: 'Ambiguous rationale without changeId.',
          confidence: 'high',
        },
      ],
    };

    // PR 100 has two sub-changes, so changeId is strictly mandatory
    const result = acceptWhyNotes(
      providerOutput,
      [subChange1, subChange2],
      'medium',
    );
    expect(result.notes).toHaveLength(0);
  });

  test('rejects note when changeId belongs to another PR (identity mismatch protection)', () => {
    const providerOutput: WhyExtractionOutput = {
      items: [
        {
          prNumber: 42, // Claiming PR 42, but changeId points to PR 100
          changeId: 'pr:100:c1',
          why: 'Mismatched PR rationale.',
          confidence: 'high',
        },
      ],
    };

    const result = acceptWhyNotes(
      providerOutput,
      [singleItem, subChange1, subChange2],
      'medium',
    );
    expect(result.notes).toHaveLength(0);
  });

  test('correctly maps notes when provider returns results in reversed order', () => {
    // Provider returns c2 first, then c1
    const providerOutput: WhyExtractionOutput = {
      items: [
        {
          prNumber: 100,
          changeId: 'pr:100:c2',
          why: 'Prevents disconnects under high load.',
          confidence: 'high',
        },
        {
          prNumber: 100,
          changeId: 'pr:100:c1',
          why: 'Enables enterprise SSO login.',
          confidence: 'high',
        },
      ],
    };

    const result = acceptWhyNotes(
      providerOutput,
      [subChange1, subChange2],
      'medium',
    );

    expect(result.skippedLowTrust).toBe(0);
    expect(result.notes).toHaveLength(2);

    const c1Note = result.notes.find((n) => n.changeId === 'pr:100:c1');
    const c2Note = result.notes.find((n) => n.changeId === 'pr:100:c2');

    expect(c1Note?.why).toBe('Enables enterprise SSO login.');
    expect(c1Note?.sectionTitle).toBe('Added');

    expect(c2Note?.why).toBe('Prevents disconnects under high load.');
    expect(c2Note?.sectionTitle).toBe('Fixed');
  });

  test('filters out low confidence and low trust notes', () => {
    const lowTrustItem: WhyExtractionItem = {
      ...singleItem,
      trustScore: 4, // below WHY_MIN_RENDER_TRUST_SCORE (7)
    };

    const providerOutput: WhyExtractionOutput = {
      items: [
        {
          prNumber: 42,
          why: 'Weak rationale.',
          confidence: 'low',
        },
      ],
    };

    const result = acceptWhyNotes(providerOutput, [lowTrustItem], 'medium');
    expect(result.notes).toHaveLength(0);
    expect(result.skippedLowTrust).toBe(1);
  });
});

describe('appendWhyPreview', () => {
  test('returns original body when notes list is empty', () => {
    expect(appendWhyPreview('Initial PR body.', [], 'Why')).toBe(
      'Initial PR body.',
    );
  });

  test('appends formatted WHY preview block to PR body', () => {
    const notes = [
      {
        prNumber: 42,
        why: 'Important bug fix.',
        confidence: 'high' as const,
        sectionTitle: 'Fixed',
        trustScore: 10,
        trustBucket: 'high' as const,
      },
    ];

    const output = appendWhyPreview('Initial PR body.', notes, 'Why');
    expect(output).toContain('### WHY preview');
    expect(output).toContain('- #42: Why: Important bug fix.');
  });
});

describe('githubWebHost', () => {
  test('resolves api.github.com to github.com', () => {
    expect(githubWebHost('https://api.github.com')).toBe('github.com');
  });

  test('resolves enterprise hostname', () => {
    expect(githubWebHost('https://github.enterprise.corp/api/v3')).toBe(
      'github.enterprise.corp',
    );
  });
});
