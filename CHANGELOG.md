# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v0.0.7] - 2025-11-18

### Added

- Support GitHub App authentication for PR creation (PAT fallback) by @nyaomaru in [#29](https://github.com/nyaomaru/changelog-bot/pull/29)

### Fixed

- add App auth via installation tokens + CI-safe env by @nyaomaru in [#31](https://github.com/nyaomaru/changelog-bot/pull/31)
- classification to use json base response by @nyaomaru in [#32](https://github.com/nyaomaru/changelog-bot/pull/32)

### Docs

- 0.0.6 by [bot] by @github-actions in [#27](https://github.com/nyaomaru/changelog-bot/pull/27)

### Chore

- Release: 0.0.7 by [bot] by @github-actions in [#30](https://github.com/nyaomaru/changelog-bot/pull/30)

**Full Changelog**: https://github.com/nyaomaru/changelog-bot/compare/v0...v0.0.7

[v0.0.7]: https://github.com/nyaomaru/changelog-bot/compare/v0.0.6...v0.0.7

## [v0.0.6] - 2025-11-15

### Fixed

- category tune fix types by @nyaomaru in [#25](https://github.com/nyaomaru/changelog-bot/pull/25)

### Chore

- 0.0.5 by [bot] by @github-actions in [#24](https://github.com/nyaomaru/changelog-bot/pull/24)
- Release: 0.0.6 by [bot] by @github-actions in [#26](https://github.com/nyaomaru/changelog-bot/pull/26)

**Full Changelog**: https://github.com/nyaomaru/changelog-bot/compare/v0...v0.0.6

[v0.0.6]: https://github.com/nyaomaru/changelog-bot/compare/v0...v0.0.6

## [v0.0.5] - 2025-11-08

### Changed

- llm pre process logic by @nyaomaru in [#22](https://github.com/nyaomaru/changelog-bot/pull/22)

### Chore

- 0.0.4 by [bot] by @github-actions in [#20](https://github.com/nyaomaru/changelog-bot/pull/20)
- Release: 0.0.5 by [bot] by @github-actions in [#23](https://github.com/nyaomaru/changelog-bot/pull/23)

**Full Changelog**: https://github.com/nyaomaru/changelog-bot/compare/v0...v0.0.5

[v0.0.5]: https://github.com/nyaomaru/changelog-bot/compare/v0...v0.0.5

## [v0.0.4] - 2025-11-04

### Changed

- add LLM pre-processing and post-tuning to improve classification by @nyaomaru in [#18](https://github.

### Chore

- v0.0.3 by [bot] by @github-actions in [#17](https://github.com/nyaomaru/changelog-bot/pull/17)
  com/nyaomaru/changelog-bot/pull/18)
- Release: 0.0.4 by [bot] by @github-actions in [#19](https://github.com/nyaomaru/changelog-bot/pull/19)

**Full Changelog**: https://github.com/nyaomaru/changelog-bot/compare/v0...v0.0.4

[v0.0.4]: https://github.com/nyaomaru/changelog-bot/compare/v0...v0.0.4

## [v0.0.3] - 2025-11-02

### Fixed

- PR title setting by @nyaomaru in [#15](https://github.com/nyaomaru/changelog-bot/pull/15)

### Chore

- version bump by @nyaomaru in [#9](https://github.com/nyaomaru/changelog-bot/pull/9)
- v0.0.2 by [bot] by @github-actions in [#8](https://github.com/nyaomaru/changelog-bot/pull/8)
- chore; update logo by @nyaomaru in [#10](https://github.com/nyaomaru/changelog-bot/pull/10)
- major tag update by @nyaomaru in [#11](https://github.com/nyaomaru/changelog-bot/pull/11)
- mise command by @nyaomaru in [#12](https://github.com/nyaomaru/changelog-bot/pull/12)
- update documents by @nyaomaru in [#14](https://github.com/nyaomaru/changelog-bot/pull/14)
- Release: 0.0.3 by [bot] by @github-actions in [#16](https://github.com/nyaomaru/changelog-bot/pull/16)

### New Contributors

- @github-actions[bot] made their first contribution in https://github.com/nyaomaru/changelog-bot/pull/8

**Full Changelog**: https://github.com/nyaomaru/changelog-bot/compare/v0...v0.0.3

[v0.0.3]: https://github.com/nyaomaru/changelog-bot/compare/v0...v0.0.3

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
