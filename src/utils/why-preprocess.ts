import {
  WHY_MAX_BODY_WITHOUT_TARGET_SECTION,
  WHY_MIN_MODEL_TRUST_SCORE,
  WHY_RAW_BODY_SCAN_LIMIT,
} from '@/constants/why.js';
import type { PullRequestDetails } from '@/types/github.js';
import type {
  WhyExtractionItem,
  WhyTarget,
  WhyTrustBucket,
} from '@/types/why.js';
import { isDependencyUpdateTitle } from '@/utils/dependency-update.js';

const TARGET_SECTION_ALIASES = new Map<string, string>([
  ['why', 'why'],
  ['reason', 'reason'],
  ['because', 'because'],
  ['motivation', 'motivation'],
  ['context', 'context'],
  ['background', 'background'],
  ['problem', 'problem'],
  ['fix', 'fix'],
  ['rationale', 'rationale'],
  ['summary', 'summary'],
  ['description', 'description'],
  ['por que', 'why'],
  ['porque', 'why'],
  ['razon', 'reason'],
  ['motivo', 'reason'],
  ['antecedentes', 'background'],
  ['problema', 'problem'],
  ['solucion', 'fix'],
  ['correccion', 'fix'],
  ['arreglo', 'fix'],
  ['resumen', 'summary'],
  ['descripcion', 'description'],
  ['pourquoi', 'why'],
  ['raison', 'reason'],
  ['contexte', 'context'],
  ['historique', 'background'],
  ['probleme', 'problem'],
  ['correction', 'fix'],
  ['resume', 'summary'],
  ['warum', 'why'],
  ['grund', 'reason'],
  ['begrundung', 'reason'],
  ['kontext', 'context'],
  ['hintergrund', 'background'],
  ['korrektur', 'fix'],
  ['fehlerbehebung', 'fix'],
  ['zusammenfassung', 'summary'],
  ['beschreibung', 'description'],
  ['razao', 'reason'],
  ['historico', 'background'],
  ['correcao', 'fix'],
  ['resumo', 'summary'],
  ['descricao', 'description'],
  ['perche', 'why'],
  ['ragione', 'reason'],
  ['contesto', 'context'],
  ['sfondo', 'background'],
  ['correzione', 'fix'],
  ['riepilogo', 'summary'],
  ['descrizione', 'description'],
  ['waarom', 'why'],
  ['reden', 'reason'],
  ['achtergrond', 'background'],
  ['probleem', 'problem'],
  ['oplossing', 'fix'],
  ['samenvatting', 'summary'],
  ['beschrijving', 'description'],
  ['理由', 'reason'],
  ['背景', 'background'],
  ['目的', 'motivation'],
  ['課題', 'problem'],
  ['問題', 'problem'],
  ['修正', 'fix'],
  ['原因', 'reason'],
  ['動機', 'motivation'],
  ['动机', 'motivation'],
  ['问题', 'problem'],
  ['修复', 'fix'],
  ['摘要', 'summary'],
  ['描述', 'description'],
  ['이유', 'reason'],
  ['배경', 'background'],
  ['목적', 'motivation'],
  ['문제', 'problem'],
  ['수정', 'fix'],
  ['요약', 'summary'],
  ['설명', 'description'],
  ['почему', 'why'],
  ['причина', 'reason'],
  ['контекст', 'context'],
  ['предыстория', 'background'],
  ['проблема', 'problem'],
  ['исправление', 'fix'],
  ['резюме', 'summary'],
  ['описание', 'description'],
]);

const TARGET_SECTION_LABEL_PATTERN = Array.from(TARGET_SECTION_ALIASES.keys())
  .sort((left, right) => right.length - left.length)
  .map(escapeRegExp)
  .join('|');

const STRONG_CANONICAL_SECTION_NAMES = new Set([
  'why',
  'reason',
  'because',
  'motivation',
  'context',
  'background',
  'problem',
  'rationale',
]);

const RATIONALE_MARKER_RE =
  /\b(because|so that|in order to|reason|rationale|motivation|to avoid|to prevent|context|problem)\b/i;
const PROBLEM_MARKER_RE =
  /\b(fix|prevent|avoid|missing|broken|incorrect|regression|failure|bug|issue|risk|support|compatib|performance)\b/i;
const ISSUE_REF_RE =
  /(?:fix(?:e[sd])?|close[sd]?|resolve[sd]?)\s+#\d+|https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/issues\/\d+/i;
const NON_SIGNAL_RE = /\b(changelog|readme|typo|format|lint|refactor only)\b/i;
const BOT_AUTHOR_RE = /(?:\[bot\]|bot$|renovate|dependabot)/i;

type PreprocessPrBodyOptions = {
  /** Maximum candidate characters to keep for this PR. */
  maxCharsPerPr: number;
};

type PreprocessPrBodyResult = {
  /** Provider-ready candidate item when local trust is sufficient. */
  item?: WhyExtractionItem;
  /** Skip reason for diagnostics. */
  skippedReason?: string;
  /** Whether the skipped item failed trust thresholds. */
  lowTrust: boolean;
};

type ExtractedSections = {
  /** Extracted text snippets from target sections. */
  sections: Array<{ name: string; text: string }>;
  /** Whether any target section was found. */
  hasTargetSection: boolean;
};

function normalizeBody(body: string): string {
  return body
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '\n')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '\n')
    .replace(/\[!\[[^\]]*]\([^)]*\)]\([^)]*\)/g, '\n')
    .replace(/^\s*[-*]\s+\[[ xX]]\s+.*$/gm, '\n')
    .replace(/^\s*<img\b[^>]*>\s*$/gim, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeHeadingName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[*_`~]/g, '')
    .replace(/[:：].*$/, '')
    .trim()
    .toLowerCase();
}

function canonicalTargetSectionName(value: string): string | undefined {
  return TARGET_SECTION_ALIASES.get(normalizeHeadingName(value));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractTargetSections(body: string): ExtractedSections {
  const headingMatches = Array.from(
    body.matchAll(/^(?<marker>#{1,6})\s+(?<title>.+?)\s*#*\s*$/gm),
  );
  const sections: Array<{ name: string; text: string }> = [];
  for (const [matchIndex, match] of headingMatches.entries()) {
    const rawTitle = match.groups?.title ?? '';
    const name = canonicalTargetSectionName(rawTitle);
    if (!name) {
      continue;
    }
    const startIndex = (match.index ?? 0) + match[0].length;
    const endIndex =
      headingMatches[matchIndex + 1]?.index === undefined
        ? body.length
        : headingMatches[matchIndex + 1].index;
    const text = body.slice(startIndex, endIndex).trim();
    if (text) sections.push({ name, text });
  }

  if (sections.length > 0) {
    return { sections, hasTargetSection: true };
  }

  const labelPattern = new RegExp(
    `(?:^|\\n)\\s*(?:\\*\\*|__)?(?<name>${TARGET_SECTION_LABEL_PATTERN})(?:\\*\\*|__)?\\s*[:：]\\s*(?<text>[^\\n]+)`,
    'gi',
  );
  for (const match of body.matchAll(labelPattern)) {
    const name = canonicalTargetSectionName(match.groups?.name ?? '');
    const text = (match.groups?.text ?? '').trim();
    if (name && text) sections.push({ name, text });
  }

  return { sections, hasTargetSection: sections.length > 0 };
}

function toCandidateSnippets(
  sections: Array<{ name: string; text: string }>,
  body: string,
  maxCharsPerPr: number,
): string[] {
  const sourceTexts =
    sections.length > 0 ? sections.map((section) => section.text) : [body];
  const snippets: string[] = [];

  for (const text of sourceTexts) {
    const cleanedLines = text
      .split('\n')
      .map((line) => line.replace(/^[-*]\s+/, '').trim())
      .filter(Boolean)
      .filter((line) => !/^https?:\/\//i.test(line));
    for (const line of cleanedLines) {
      const compactLine = line.replace(/\s+/g, ' ').trim();
      if (compactLine.length < 16) continue;
      snippets.push(compactLine.slice(0, 240));
      if (snippets.join('\n').length >= maxCharsPerPr) {
        return boundSnippets(snippets, maxCharsPerPr);
      }
    }
  }

  return boundSnippets(snippets, maxCharsPerPr);
}

function boundSnippets(snippets: string[], maxCharsPerPr: number): string[] {
  const bounded: string[] = [];
  let usedChars = 0;
  for (const snippet of snippets) {
    const availableChars = maxCharsPerPr - usedChars;
    if (availableChars <= 0) break;
    bounded.push(snippet.slice(0, availableChars));
    usedChars += snippet.length + 1;
  }
  return bounded;
}

function trustBucketForScore(score: number): WhyTrustBucket {
  if (score >= 9) return 'high';
  if (score >= WHY_MIN_MODEL_TRUST_SCORE) return 'medium';
  if (score > 0) return 'low';
  return 'none';
}

function scoreCandidateMaterial(
  sections: Array<{ name: string; text: string }>,
  candidates: string[],
  body: string,
): number {
  const candidateText = candidates.join('\n');
  let score = 0;

  if (
    sections.some((section) => STRONG_CANONICAL_SECTION_NAMES.has(section.name))
  ) {
    score += 4;
  } else if (sections.length > 0) {
    score += 2;
  }
  if (RATIONALE_MARKER_RE.test(candidateText)) score += 3;
  if (PROBLEM_MARKER_RE.test(candidateText)) score += 2;
  if (ISSUE_REF_RE.test(body)) score += 1;
  if (candidateText.length >= 60) score += 1;
  if (candidateText.length > 500) score += 1;
  if (containsNonAscii(candidateText) && candidateText.length >= 40) {
    score += 6;
  }
  if (NON_SIGNAL_RE.test(candidateText)) score -= 2;

  return Math.max(score, 0);
}

function hasStrongStructuralSignal(
  sections: Array<{ name: string; text: string }>,
): boolean {
  return sections.some((section) =>
    STRONG_CANONICAL_SECTION_NAMES.has(section.name),
  );
}

function containsNonAscii(value: string): boolean {
  return Array.from(value).some((character) => character.charCodeAt(0) > 127);
}

/**
 * Convert a PR body into bounded WHY candidate snippets with local trust.
 * @param target Changelog PR target.
 * @param details Pull request details fetched from GitHub.
 * @param options Preprocessing limits.
 * @returns Provider-ready item or a skip reason.
 */
export function preprocessWhyPrBody(
  target: WhyTarget,
  details: PullRequestDetails,
  options: PreprocessPrBodyOptions,
): PreprocessPrBodyResult {
  const title = details.title || target.itemText;
  if (
    isDependencyUpdateTitle(title) ||
    (details.author && BOT_AUTHOR_RE.test(details.author))
  ) {
    return {
      skippedReason: `Skipped PR #${target.prNumber}: automatic maintenance PR`,
      lowTrust: false,
    };
  }

  const body = normalizeBody(details.body).slice(0, WHY_RAW_BODY_SCAN_LIMIT);
  if (!body) {
    return {
      skippedReason: `Skipped PR #${target.prNumber}: empty PR description`,
      lowTrust: true,
    };
  }

  const extracted = extractTargetSections(body);
  if (
    !extracted.hasTargetSection &&
    body.length > WHY_MAX_BODY_WITHOUT_TARGET_SECTION
  ) {
    return {
      skippedReason: `Skipped PR #${target.prNumber}: PR description too large without target section`,
      lowTrust: true,
    };
  }

  const candidates = toCandidateSnippets(
    extracted.sections,
    body,
    options.maxCharsPerPr,
  );
  if (candidates.length === 0) {
    return {
      skippedReason: `Skipped PR #${target.prNumber}: no usable WHY candidate`,
      lowTrust: true,
    };
  }

  const trustScore = scoreCandidateMaterial(
    extracted.sections,
    candidates,
    body,
  );
  const trustBucket = trustBucketForScore(trustScore);
  const requiresHighConfidence =
    containsNonAscii(candidates.join('\n')) &&
    !hasStrongStructuralSignal(extracted.sections);
  if (trustScore < WHY_MIN_MODEL_TRUST_SCORE) {
    return {
      skippedReason: `Skipped PR #${target.prNumber}: low local trust score (${trustScore})`,
      lowTrust: true,
    };
  }

  return {
    item: {
      prNumber: target.prNumber,
      itemText: target.itemText,
      sectionTitle: target.sectionTitle,
      title,
      candidates,
      trustScore,
      trustBucket,
      requiresHighConfidence,
    },
    lowTrust: false,
  };
}
