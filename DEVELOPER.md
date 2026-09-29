# DEVELOPER.md

Welcome! This is the developer guide for changelog-bot. It keeps things practical and aligned with how the repo works today. Have fun building! ✨

## Quick Start

- Requirements: Node 22, pnpm 11
- Recommended: use mise to pin tools and run tasks

```sh
# Clone and install
mise install              # installs Node 22
mise dev_install          # installs dependencies

# Build and try the CLI
mise build                # compile TS → dist/
mise start                # run compiled JS
```

Using mise tasks:

- Build: `mise build`
- Test: `mise test`
- QA: `mise qa` (lint + test + build + check:dist)

## Project Map

- src/ TypeScript sources (ESM, strict)
  - cli.ts CLI entry wrapper (shebang + process wiring)
  - index.ts CLI implementation (Yargs) reused by the wrapper
  - lib/ git + changelog + PR + GitHub API helpers
  - providers/ LLM providers (openai, anthropic) and JSON extraction utils
  - utils/ helpers (classification, release parsing, PR mapping, HTTP, etc.)
  - schema/ Zod schemas for CLI/env/provider outputs
  - constants/ provider, prompt limits, git, changelog, time, etc.
- tests/ Jest tests (Node, ts-jest ESM preset)
- dist/ Compiled JS — do not edit

Alias: `@/…` → `src/` (see tsconfig.json and jest.config.cjs `moduleNameMapper`).

## Everyday Commands

- `pnpm build` compile TypeScript (`tsc` + `tsc-alias`)
- `pnpm dev` run the CLI from TS (`ts-node-esm`)
- `pnpm start` run compiled CLI (`node dist/cli.js`)
- `pnpm test` run Jest tests (`tests/**/*.test.ts`)
- `pnpm eval:why` run WHY extraction evaluation

Handy dry-run example:

```sh
node dist/cli.js \
  --release-tag HEAD \
  --release-name 0.1.0 \
  --provider openai \
  --dry-run
```

## LLM Integration

- Providers: `src/providers/openai.ts`, `src/providers/anthropic.ts`
  - Both return the same output shape; `LLMOutputSchema` normalizes defaults.
  - OpenAI uses Responses API; Anthropic uses Messages API.
  - JSON extraction is robust to extra prose via `utils/json-extract.ts#extractJsonObject`.
- Classification (`src/utils/classify.ts`)
  - Uses selected provider to map PR titles → categories.
  - On missing API key or error, falls back to `{ Chore: titles }` deterministically.
- Fallback behavior (no AI)
  - If keys are missing or model calls fail, the CLI builds a section from git logs (or GitHub Release Notes if provided) and continues.
  - PR body is annotated with: “Generated without LLM. Reason: …”.

Env vars (see README for full list):

- `GITHUB_TOKEN` required to open a PR (not needed for `--dry-run`)
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` optional
- `REPO_FULL_NAME` optional, assists link resolution

## Coding Style

- TypeScript ESM, `strict: true`; prefer pure functions in `utils/`
- Names: files kebab-case; types/classes PascalCase; functions/vars lowerCamelCase
- Indentation: 2 spaces; keep existing style
- Comments: add JSDoc to public exports; add short WHY comments for non-obvious logic
- Imports: prefer `@/…` alias over deep relative paths
- Do not edit `dist/` manually

See AGENTS.md for additional conventions used by this repo.

## Tests

- Runner: Jest (`jest.config.cjs` uses `ts-jest` ESM preset)
- Location: `tests/**/*.test.ts`
- Alias mapping: `@/…` → `src/` is configured in `moduleNameMapper`
- Run: `pnpm test` (or `mise run test`)

Tips:

- Cover normal paths and edge/error cases
- Keep helpers small and unit-testable

## WHY Extraction Evaluation

The evaluation suite benchmarks the experimental Jev selection engine against a selected baseline LLM provider on labeled PR descriptions (defaulting to the 50-case benchmark in `tests/fixtures/why-corpus.json`).

### Running Evaluations

`pnpm eval:why` runs Jev alongside one selected baseline provider (`openai`, `anthropic`, or `gemini`, defaulting to OpenAI).

Useful options:

- **Repeated runs**: `pnpm eval:why --runs 3` (or `WHY_EVALUATION_RUNS=3`) measures latency percentiles (`min`, `mean`, `p95`, `max`) and checks consistency across repeated runs.
- **Select baseline provider**: set `WHY_EVALUATION_PROVIDER=anthropic` or `WHY_EVALUATION_PROVIDER=gemini` (defaults to `openai`).
- **Threshold sweep**: `pnpm eval:why --sweep` (or `WHY_EVALUATION_SWEEP=true`) evaluates Jev across fine-grained confidence thresholds (`0.40` through `0.90` in `0.05` increments) to inspect Precision and Recall curves.
- **Custom output directory**: `--output-dir <path>` (or `WHY_EVALUATION_OUTPUT_DIR=<path>`, defaults to `evaluations/reports`).
- **Skip file persistence**: `--no-persist` (or `WHY_EVALUATION_NO_PERSIST=true`) prints benchmark results to stdout without saving report files to disk.
- **Custom corpus**: point `WHY_EVALUATION_CORPUS_PATH` to an alternative labeled dataset.

### Evaluation Artifacts

Unless `--no-persist` is specified, runs save reproducible benchmark artifacts under `evaluations/reports/`:

- Structured report: `evaluations/reports/eval-<timestamp>-<shortSha>.json`
- Human-readable summary: `evaluations/reports/eval-<timestamp>-<shortSha>.md`

The `evaluations/reports/` directory is ignored by git to keep transient run logs out of source control.

### On-Demand CI Workflow

GitHub Actions includes an on-demand workflow (`.github/workflows/why-eval.yaml`) triggered via `workflow_dispatch`. The GitHub Actions UI exposes:

- `runs`: number of repeated evaluation runs per engine (defaults to `3`).
- `provider`: baseline provider to evaluate against Jev (`openai`, `anthropic`, or `gemini`).

Evaluation artifacts are uploaded as workflow run artifacts named `why-evaluation-reports`. (Note: threshold sweeps via `--sweep` are currently available through the CLI runner).

## Contributing Flow

1. Implement in `src/**` with small, focused changes
2. Add/adjust tests under `tests/**` as needed
3. `pnpm build` and `pnpm test` must pass
4. Follow Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`)
5. For PRs, include a brief rationale and, if relevant, a dry-run snippet showing `CHANGELOG.md` changes

## Release Notes Generation Tips

- Use `--dry-run` to verify the generated section before writing/PR
- Provide `--release-body` (or tag release notes) to guide the section
- Without AI keys, expect deterministic fallback output and a PR note explaining why

Happy hacking! 🛠✨
