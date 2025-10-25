<h1 align="center">
  <img src="https://raw.githubusercontent.com/nyaomaru/changelog-bot/main/public/ChangelogBot_logo02.png" alt="changelog-bot type logo" width="400" />
  changelog-bot
</h1>

<p align="center">
    <img src="https://raw.githubusercontent.com/nyaomaru/changelog-bot/main/public/ChangelogBot_image.png" width="600px" align="center" alt="changelog-bot logo" />
</p>

Release mornings are supposed to feel exciting, not tedious. `changelog-bot` turns your Git history and release notes into a polished changelog entry (and optional PR) in a single run. Drop it into CI, run it locally, or hand it to your release captain—either way, you ship with a crisp changelog and zero copy-paste fatigue.

## Why changelog-bot?

- **Automated storytelling:** Combines commit history, PR titles, and release notes to produce human-ready changelog sections.
- **LLM superpowers (optional):** Connect OpenAI or Anthropic for tone-aware summaries; skip the keys and it still ships with a reliable heuristic fallback.
- **PR-ready output:** Can open a pull request with updated changelog, compare links, and release notes already wired up.
- **Safe defaults:** Detects duplicate versions, keeps compare links current, and won’t fail a release if AI is down.
- **CI-native:** Works as a GitHub Action, reusable workflow, or plain CLI—no fragile scripting required.

## Quick start

Run the published CLI right away—no local tooling prep required.

```sh
npx @nyaomaru/changelog-bot --help
# or
pnpm dlx @nyaomaru/changelog-bot --help
```

Prefer to keep it on hand? Add it to your dev dependencies and call it from your scripts (or directly via `pnpm exec`):

```sh
pnpm add -D @nyaomaru/changelog-bot
pnpm exec changelog-bot --help
```

Using it in CI? Jump to [GitHub Actions integration](#github-actions-integration) for drop-in workflow examples.

## Usage

Run the CLI however it fits your workflow—install it globally, call it from project scripts, or reach for one-off commands via `npx`/`pnpm dlx`.

Recommended invocations:

```sh
# Run without installing (npm)
npx @nyaomaru/changelog-bot --help

# Run without installing (pnpm)
pnpm dlx @nyaomaru/changelog-bot --help

# After installing in your project (scripts resolve the bin)
npx changelog-bot --help

# If you prefer, directly call the bin name when globally installed
changelog-bot --help
```

### Options

| Option             | Description                                         | Default            |
| ------------------ | --------------------------------------------------- | ------------------ |
| `--repo-path`      | Path to repository root                             | `.`                |
| `--changelog-path` | Path to CHANGELOG file                              | `CHANGELOG.md`     |
| `--base-branch`    | Base branch for PR                                  | `main`             |
| `--provider`       | LLM provider (`openai` or `anthropic`)              | `openai`           |
| `--release-tag`    | Git ref (tag or HEAD) to generate release for       | latest tag or HEAD |
| `--release-name`   | Display name for version (without `v`)              | derived from tag   |
| `--release-body`   | Additional release notes body                       | `""`               |
| `--dry-run`        | Print updated CHANGELOG to stdout, don’t write file | `false`            |

## Examples

### Dry-run for latest release

```sh
npx @nyaomaru/changelog-bot \
  --release-tag HEAD \
  --release-name 0.1.0-dev \
  --changelog-path CHANGELOG.md \
  --provider openai \
  --dry-run
```

### Generate changelog for a tagged release

```sh
npx @nyaomaru/changelog-bot \
 --release-tag vx.y.z \
 --release-name x.y.z \
 --changelog-path CHANGELOG.md \
 --provider openai
```

### Run without AI keys (fallback)

If `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` are not set, the CLI skips model calls and builds a heuristic section from git logs (or uses GitHub Release Notes when provided). The PR body includes a note with the fallback reason, so everyone knows the run was deterministic.

```sh
# No AI keys in env
npx @nyaomaru/changelog-bot --release-tag HEAD --release-name 1.2.3
```

Example PR body suffix:

```
Note: Generated without LLM. Reason: Missing API key for provider: openai.
```

### Force a specific model (example: gpt-4o-mini)

```sh
export OPENAI_MODEL=gpt-4o-mini
export OPENAI_API_KEY=sk-xxxx
npx @nyaomaru/changelog-bot --release-tag HEAD --release-name 1.0.0 --dry-run
```

### From source (local checkout)

Working in a clone? Follow the steps in [Local development setup](#local-development-setup) to install dependencies and run the CLI directly.

## Configuration

Bring your own keys and tokens as needed—`changelog-bot` only asks for what it truly uses.

- Environment variables:
  - `GITHUB_TOKEN` (required for PR creation; not required for `--dry-run`)
  - `OPENAI_API_KEY` (optional)
  - `ANTHROPIC_API_KEY` (optional)
  - `REPO_FULL_NAME` (optional, `owner/repo`; used for link resolution)
  - `OPENAI_MODEL` (optional; defaults to `gpt-4o-mini`)
  - `ANTHROPIC_MODEL` (optional; defaults to `claude-3-5-sonnet-20240620`)

### Fallback behavior (when AI is unavailable)

- Missing AI keys or API failure does not fail the run.
- If GitHub Release Notes are provided for the tag, they are used as the source of truth.
- Otherwise, a heuristic section is built from `git log` and merged PRs.
- The PR body is annotated with: “Generated without LLM. Reason: …”.
- Title classification uses the provider when available; without keys, all titles are grouped under `Chore` to remain deterministic.

## GitHub Actions integration

Plug it into CI in minutes. Pick the flavor that matches your workflow:

1. As a GitHub Action (recommended)

```yaml
name: Update Changelog

on:
  release:
    types: [published]

jobs:
  changelog:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: nyaomaru/changelog-bot@v0
        with:
          changelog-path: CHANGELOG.md
          base-branch: main
          provider: openai
          release-tag: ${{ github.event.release.tag_name }}
          release-name: ${{ github.event.release.tag_name }}
          # npm-version: latest   # optionally pin a version/range
          # dry-run: 'true'       # to avoid writing + PR
        env:
          # Optional: set one of the following to enable AI generation
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          # ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

2. Directly run the CLI in your workflow

```yaml
name: Update Changelog

on:
  release:
    types: [published]

jobs:
  changelog:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npx @nyaomaru/changelog-bot \
          --release-tag ${{ github.event.release.tag_name }} \
          --release-name ${{ github.event.release.tag_name }} \
          --changelog-path CHANGELOG.md \
          --provider openai
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          # ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          REPO_FULL_NAME: ${{ github.repository }}
```

3. As a reusable workflow (workflow_call)

```yaml
jobs:
  changelog:
    uses: nyaomaru/changelog-bot/.github/workflows/changelog.yaml@v0
    with:
      changelog_path: CHANGELOG.md
      base_branch: main
      provider: openai
      release_tag: ${{ github.event.release.tag_name }}
      release_name: ${{ github.event.release.tag_name }}
      # release_body: '...'
      # dry_run: 'true'
    secrets:
      REPO_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      # ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

Action inputs (for both 1 and 3):

- `changelog-path` / `changelog_path`: path to `CHANGELOG.md` (default `CHANGELOG.md`).
- `base-branch` / `base_branch`: base branch for PR (default `main`).
- `provider`: `openai` or `anthropic` (default `openai`).
- `npm-version` / `npm_version`: npm dist-tag or range for the CLI package (default `latest`).
- `release-tag` / `release_tag`: tag or ref to generate for.
- `release-name` / `release_name`: display version (without `v`).
- `release-body` / `release_body`: extra release notes to merge.
- `dry-run` / `dry_run`: `'true'` to print without writing/PR.

Outputs: None.

Environment:

- `GITHUB_TOKEN` (required to create the PR; not needed in dry-run).
- `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` (optional for AI generation).
- `REPO_FULL_NAME` auto-set by the Action; set yourself if calling the CLI directly.

## Local development setup

If you're contributing to `changelog-bot`, the repo ships a `mise.toml` to pin tool versions and expose handy tasks.

### Mise (toolchain & tasks)

- Tools: Node `22`, pnpm `10.12`.
- Tasks: `lint`, `build`, `test`, `test_unit`, `test_performance`, `qa`.

```sh
# Install tool versions declared in mise.toml
mise install

# Run common tasks
mise run build         # same as: pnpm build
mise run lint          # same as: pnpm lint
mise run test          # same as: pnpm test
mise run qa            # runs lint, test, build in sequence
```

### Manual setup

```sh
pnpm install
pnpm run build

# Configure environment variables (OpenAI / Anthropic API keys, GitHub token, etc.)
# by copying `.env.example` to `.env` and filling the required values.
cp .env.example .env

# Optional: run via npx after publishing
npx @nyaomaru/changelog-bot --help
```

## Notes

- AI keys are optional; the CLI degrades gracefully with a fallback changelog and PR note.
- `GITHUB_TOKEN` is required to create a PR (non-dry-run).
- Duplicate version headings are detected to prevent accidental re-inserts.
- Compare links are ensured/updated automatically.

**Compatibility Policy**

- During `v0`, breaking changes may occur as we stabilize flags and output. We avoid breaks when possible and document changes in the changelog.
- To pin versions:
  - Action: use a major tag (`uses: nyaomaru/changelog-bot@v0`) or a specific ref (e.g., `@v0.1.2`).
  - Action + CLI pin: set `npm-version` input (e.g., `npm-version: 0.1.2`).
  - npx: `npx @nyaomaru/changelog-bot@0.1.2 ...`.
- From `v1` onward, we follow SemVer: no breaking changes without a major version bump.
