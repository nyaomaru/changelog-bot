# DEVELOPER.md

Welcome! This is the developer guide for changelog-bot. It keeps things practical and aligned with how the repo works today. Have fun building! ✨

## Quick Start

- Requirements: Node 22, pnpm 10.12
- Recommended: use mise to pin tools and run tasks

```sh
# Clone and install
mise install              # installs Node 22 and pnpm 10.12
pnpm install

# Build and try the CLI
pnpm build                # compile TS → dist/
pnpm dev                  # run from TS (ts-node-esm)
pnpm start                # run compiled JS
```

Using mise tasks:

- Build: `mise run build`
- Test: `mise run test`
- QA: `mise run qa` (lint + test + build; note: lint script may be absent)

## Project Map

- src/ TypeScript sources (ESM, strict)
  - index.ts CLI entry (Yargs) → outputs to dist/index.js
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
- `pnpm start` run compiled CLI (`node dist/index.js`)
- `pnpm test` run Jest tests (`tests/**/*.test.ts`)

Handy dry-run example:

```sh
node dist/index.js \
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
