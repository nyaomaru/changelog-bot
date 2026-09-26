# v1 Changelog Content Pipeline

## Status

Phases 1-3 are implemented. Phases 4-7 are planned for implementation before v1.
Each numbered phase should remain a separately reviewable change and preserve
existing output unless its acceptance criteria explicitly change behavior.

## Background

The original pipeline identified changes by their display titles, asked providers
to return category-to-title maps, and let provider output include Markdown and
delivery metadata. This makes duplicate titles ambiguous, allows omitted
classifier entries to disappear, and spreads classification rules across the
provider, heuristic, tuning, and rendering paths.

The v1 pipeline should preserve every source change by a stable identity, limit
providers to editorial decisions, and render structural Markdown
deterministically.

## Design principles

- Never lose a source change silently.
- Use stable IDs for classification and reconciliation; titles are content, not
  identity.
- Keep version headings, anchors, compare links, and delivery metadata outside
  provider control.
- Apply the same classification precedence in AI and deterministic modes.
- Preserve diagnostics when optional enrichment fails.
- Keep each migration phase behavior-compatible where practical.

## Implementation phases

### 1. Introduce the canonical release-change identity (implemented)

Add a `ReleaseChange` domain type with a stable `id` and a discriminated
`origin` (`pull-request`, `commit`, or `release-note`). Convert parsed release
items and commit/PR-derived items into this type before classification.

Acceptance criteria:

- Pull requests use `pr:<number>` IDs.
- Unmapped commits use `commit:<sha>` IDs.
- Release-note-only items use deterministic `release-note:<index>` IDs.
- Duplicate display titles with different origins retain distinct IDs.
- Repeated references to the same explicit PR become one canonical change.
- Changes resolving to the same PR during enrichment are deduplicated before
  classification.
- Generated Markdown remains unchanged.

### 2. Classify by ID and reconcile provider output (implemented)

Replace category-to-title responses with assignments keyed by release-change
ID. Validate category names and reconcile the response against the input set.

Acceptance criteria:

- Every input ID appears exactly once after reconciliation.
- Unknown IDs and unknown categories are rejected.
- Missing IDs fall back to deterministic classification and produce a
  diagnostic.
- Duplicate titles do not affect classification or rendering.

### 3. Consolidate deterministic classification (implemented)

Replace the separate fallback, score, and post-classification precedence rules
with one canonical classifier. Provider classifications may be corrected by
explicit source signals.

Precedence:

1. Conventional breaking marker or explicit breaking metadata.
2. Conventional commit type.
3. Strong semantic signals.
4. Weak semantic signals.
5. `Chore` fallback.

Acceptance criteria:

- Scoped and unscoped `feat!:` / `fix!:` changes are `Breaking Changes`.
- AI and no-AI paths apply the same hard rules.
- Existing scoring fixtures continue to pass unless they contradict the
  precedence above.

### 4. Render changelog structure deterministically

Replace provider-authored section Markdown with editorial fields on
`ReleaseChange` values. Render headings, ordering, links, anchors, and release
metadata exclusively in the backend. Split changelog content from pull-request
delivery data.

Acceptance criteria:

- Providers cannot set compare links, anchors, version headings, or labels.
- Markdown is rendered from validated release changes.
- Full-generation, release-note, and no-AI paths share one renderer.
- Existing customization remains able to influence prose and grouping without
  changing structural fields.

### 5. Enforce completeness and empty-release behavior

Add a final invariant check before rendering and replace the fabricated
`Summary of changes` fallback with an explicit policy.

Acceptance criteria:

- No source change disappears without a recorded exclusion reason.
- Duplicate IDs fail validation.
- An empty release returns a typed no-change result rather than invented text.
- CLI behavior for no-change results is documented and tested.

### 6. Preserve enrichment diagnostics and bound concurrency

Replace silent GitHub lookup fallbacks with typed enrichment diagnostics. Fetch
independent PR metadata with a small concurrency limit.

Acceptance criteria:

- Not found, unauthenticated, rate-limited, invalid-response, and network-error
  outcomes are distinguishable.
- Optional enrichment failures do not remove release changes.
- Dry-run diagnostics summarize degraded metadata.
- Concurrency is bounded and covered by tests.

### 7. Separate output destinations

Model generation independently from delivery so the same result can be printed,
written to a file, or submitted as a pull request.

Acceptance criteria:

- Generation has no filesystem or GitHub write side effects.
- `stdout`, `file`, and `pull-request` delivery paths consume the same result.
- The public CLI choice and compatibility behavior are documented before this
  phase is implemented.

## Product decision: changelog audience

Before changing default category visibility, decide whether the primary output
is a complete maintainer log or user-facing release notes. A later design may
introduce an audience policy such as `user`, `maintainer`, or `all`; this is not
part of the mechanical pipeline migration above.

## Explicit non-goals

- A shared base class for provider adapters.
- Additional splitting of the current orchestration modules solely by file
  size.
- Changing category visibility before the audience decision is made.
