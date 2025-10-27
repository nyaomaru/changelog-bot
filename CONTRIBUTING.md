# 😺 Contributing to changelog-bot

🎉 Thanks for considering contributing to `@nyaomaru/changelog-bot`!

We welcome improvements of all kinds: features, fixes, tests, docs, and refactors.

---

## 🛠 Setup

Using mise (recommended):

```sh
mise install         # installs Node 22 and pnpm 10.12
pnpm install
```

Or manual:

```sh
pnpm install
```

Run the CLI locally (examples):

```sh
pnpm build
node dist/cli.js --release-tag HEAD --release-name 0.1.0 --dry-run
# or iterate fast from TS
pnpm dev -- --release-tag HEAD --release-name 0.1.0 --dry-run
```

Run tests:

```sh
pnpm test
```

Note: AI keys are optional. Without them, the CLI generates a deterministic fallback and annotates the PR body with the reason. `GITHUB_TOKEN` is only required when actually creating a PR (not for `--dry-run`).

## Workflow

1. Fork this repository
2. Clone your fork

```sh
git clone https://github.com/YOUR_USERNAME/changelog-bot.git
cd changelog-bot
```

3. Create a feature branch

```sh
git checkout -b your-feature-name
```

## 🌱 Branch Naming

We don’t enforce strict rules, but prefer clear, kebab-case names:

- `feat/improve-compare-link-updates`
- `fix/section-normalize-edge-cases`
- `docs/update-readme`

Reserved pattern used by the tool for generated PRs: `chore/changelog-vX.Y.Z`.

## 💬 Commit Messages

Use Conventional Commits (friendly if you forget!):

```
<type>(<optional-scope>): brief description

Examples:
feat(provider): add structured output for OpenAI
fix(changelog): avoid duplicate compare link
```

Types include: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.

## 🚀 Pull Request Checklist

- Build passes: `pnpm build`
- Tests pass: `pnpm test`
- Describe what changed and why; link issues (e.g., Closes #123)
- Add or update tests for changed behavior when possible
- Include a dry-run snippet or output showing the resulting `CHANGELOG.md` changes when applicable
- Do not edit `dist/` manually

## 📏 Style Guide

- TypeScript ESM, `strict` mode
- Indentation 2 spaces; follow existing style
- Naming: files kebab-case; Types/classes PascalCase; functions/vars lowerCamelCase; constants UPPER_SNAKE_CASE
- Prefer small, pure utilities in `src/utils/` to aid testing
- Add JSDoc to public exports; add short WHY comments for non-obvious logic
- Use the `@/` path alias for imports

## 🔧 Useful Commands

- `pnpm build` — compile TS (`tsc` + `tsc-alias`)
- `pnpm dev` — run CLI from TS (`ts-node-esm`)
- `pnpm start` — run compiled CLI (`node dist/cli.js`)
- `pnpm test` — run Jest tests
- `mise run qa` — run lint + test + build (if lint is configured)

## 🧪 Testing Notes

- Tests live in `tests/**/*.test.ts` (Jest + ts-jest ESM)
- The alias `@/…` maps to `src/` (see `jest.config.cjs`)
- Cover normal paths and edge cases (empty inputs, unusual commit messages, escaping)

## 🔐 Environment

- `GITHUB_TOKEN` required only to create a PR (omit for `--dry-run`)
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` are optional; without them the CLI uses a fallback and continues

Thanks again! If you have questions or ideas, open an Issue/PR — we’re friendly. 🚀
