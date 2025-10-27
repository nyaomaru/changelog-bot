# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v0.0.2] - 2025-10-27

### Fixed

- permission denied error by @nyaomaru in [#7](https://github.com/nyaomaru/changelog-bot/pull/7)

### Chore

- update action name by @nyaomaru in [#3](https://github.com/nyaomaru/changelog-bot/pull/3)
- add update changelog workflow by @nyaomaru in [#4](https://github.com/nyaomaru/changelog-bot/pull/4)
- update README by @nyaomaru in [#5](https://github.com/nyaomaru/changelog-bot/pull/5)
- set release version by @nyaomaru in [#6](https://github.com/nyaomaru/changelog-bot/pull/6)

**Full Changelog**: https://github.com/nyaomaru/changelog-bot/compare/v0.0.1...v0.0.2

[v0.0.2]: https://github.com/nyaomaru/changelog-bot/compare/v0.0.1...v0.0.2

## [0.0.1] - 2025-10-26

### 🚀 Initial Release

The first public release of **changelog-bot**. It's a CLI & GitHub Action that automates changelog generation and PR creation from your Git history.

This early version aims to streamline the release workflow by generating human-readable changelogs using both conventional commits and LLM-based summaries.

### ✨ Features

- **CLI**: Generate changelogs directly from your terminal (`npx @nyaomaru/changelog-bot`).
- **GitHub Action**: Drop-in workflow for automatic changelog PRs on new releases.
- **AI integration (optional)**: Use OpenAI or Anthropic to produce tone-aware summaries.
- **Heuristic fallback**: Works fully offline or without API keys.
- **Duplicate detection**: Prevents multiple inserts for the same version.
- **Compare links auto-update**: Ensures all release references stay current.
- **CI-friendly**: Zero setup required, supports dry-run and base-branch configuration.

### ⚙️ Configuration

- Supports `.env` for `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `GITHUB_TOKEN`.
- Exposes options like:
  - `--release-tag`
  - `--release-name`
  - `--base-branch`
  - `--changelog-path`
  - `--provider`
    and more.

### 🧩 Developer Experience

- Built with **TypeScript** and **pnpm**.
- Managed via **mise** toolchain (`node 22`, `pnpm 10`).
- Includes lint, build, test, and QA tasks for contributor consistency.

### ⚠️ Early-stage notice

> [!IMPORTANT]
> This is an early-stage (`v0.0.1`) release.
> APIs, CLI flags, and output formats may change before the first major version (`v1.0.0`).
> If you integrate it into production workflows, please **pin the version** to avoid breaking changes.

---

**Full Changelog:** [v0.0.1](https://github.com/nyaomaru/changelog-bot/releases/tag/v0.0.1)
