<h1 align="center">
  <img src="https://raw.githubusercontent.com/nyaomaru/changelog-bot/main/public/ChangelogBot_logo02.png" alt="changelog-bot type logo" width="360" />
</h1>

<p align="center">
    <img src="https://raw.githubusercontent.com/nyaomaru/changelog-bot/main/public/ChangelogBot_image.png" width="600px" align="center" alt="changelog-bot logo" />
</p>

Releases should feel exciting, not tedious.

`@nyaomaru/changelog-bot` 🤖 turns your Git history and release notes into a polished changelog entry (and optional PR) in a single run. Drop it into CI, run it locally, or hand it to your release captain—either way, you ship with a crisp changelog and zero copy-paste fatigue.

## Why changelog-bot?

- **Automated storytelling:** Combines commit history, PR titles, and release notes to produce human-ready changelog sections.
- **LLM superpowers (optional):** Connect OpenAI or Anthropic for tone-aware summaries or skip API keys entirely and rely on a robust heuristic fallback.
- **PR-ready output:** Can open a pull request with updated changelog, compare links, and release notes already wired up.
- **Safe defaults:** Detects duplicate versions, keeps compare links current, and won’t fail a release if AI is down.
- **CI-native:** Works as a GitHub Action, reusable workflow, or plain CLI—no fragile scripting required.

> [!IMPORTANT]
> This project is currently in its early stages (`v0.0.x`).
> Interfaces and behaviors may change without notice until `v1.0.0`.
> If you plan to integrate it into production workflows, please pin the exact version to avoid unexpected breaking changes.

## Quick start

Run the published CLI right away—no local tooling prep required.

```sh
pnpm dlx @nyaomaru/changelog-bot --help
```

Prefer to keep it on hand? Add it to your dev dependencies and call it from your scripts (or directly via `pnpm exec`):

```sh
pnpm add -D @nyaomaru/changelog-bot
pnpm exec changelog-bot --help
```

Using it in CI? Jump to [GitHub Actions integration](#github-actions-integration) for drop-in workflow examples.

### Options

| Option                  | Description                                           | Default                                |
| ----------------------- | ----------------------------------------------------- | -------------------------------------- |
| `--repo-path`           | Path to repository root                               | `.`                                    |
| `--config`              | Path to JSON config file                              | `changelog-bot.config.json` if present |
| `--changelog-path`      | Path to CHANGELOG file                                | `CHANGELOG.md`                         |
| `--base-branch`         | Base branch for PR                                    | `main`                                 |
| `--provider`            | LLM provider (`openai`, `anthropic`, or `gemini`)     | `openai`                               |
| `--release-tag`         | Git ref (tag or HEAD) to generate release for         | latest tag or HEAD                     |
| `--release-name`        | Display name for version (without `v`)                | derived from tag                       |
| `--release-body`        | Additional release notes body                         | `""`                                   |
| `--language`            | Language for generated changelog prose                | `en`                                   |
| `--instructions`        | Additional changelog writing/grouping instructions    | unset                                  |
| `--instructions-file`   | Path to a file with additional instructions           | unset                                  |
| `--dry-run`             | Print updated CHANGELOG to stdout, don’t write file   | `false`                                |
| `--dry-run-json-report` | Print dry-run provider diagnostics as JSON            | `false`                                |
| `--fail-on-llm-error`   | Fail instead of falling back when provider calls fail | `false`                                |
| `--require-provider`    | Fail when the selected provider API key is missing    | `false`                                |
| `--no-ai`               | Skip all provider calls and use deterministic output  | `false`                                |

## Examples

### Dry-run for latest release

```sh
pnpm dlx @nyaomaru/changelog-bot \
  --release-tag HEAD \
  --release-name 0.1.0-dev \
  --changelog-path CHANGELOG.md \
  --provider openai \
  --dry-run
```

Dry-runs print provider diagnostics before the generated changelog so you can
confirm whether an LLM request was used or the run fell back. Add
`--dry-run-json-report` to print that diagnostics block as JSON with `provider`,
`model`, `aiUsed`, and `fallbackReasons`.

### Generate changelog for a tagged release

```sh
pnpm dlx @nyaomaru/changelog-bot \
 --release-tag vx.y.z \
 --release-name x.y.z \
 --changelog-path CHANGELOG.md \
 --provider openai
```

### Run without AI keys (fallback)

If the selected provider API key is not set, the CLI skips model calls and builds a heuristic section from git logs (or uses GitHub Release Notes when provided). The PR body includes a note with the fallback reason, so everyone knows the run was deterministic. Use `--require-provider` to fail instead when the key is missing, `--fail-on-llm-error` to fail on provider API/schema failures, or `--no-ai` to skip provider calls intentionally.

```sh
# No AI keys in env
pnpm dlx @nyaomaru/changelog-bot --release-tag HEAD --release-name 1.2.3
```

Example PR body suffix:

```
Note: Generated without LLM. Reason: Missing API key for provider: openai.
```

### Force a specific model (example: gpt-4o-mini)

```sh
export OPENAI_MODEL=gpt-4o-mini
export OPENAI_API_KEY=sk-xxxx
pnpm dlx @nyaomaru/changelog-bot --release-tag HEAD --release-name 1.0.0 --dry-run
```

### Customize generated changelog style

```sh
pnpm dlx @nyaomaru/changelog-bot \
  --release-tag HEAD \
  --release-name 1.0.0 \
  --language ja \
  --instructions-file .github/changelog-instructions.md \
  --dry-run
```

Custom instructions are additive: the bot still enforces its JSON schema,
deduplication, and factuality rules.

### Use a config file

Create `changelog-bot.config.json` in the directory where you run the CLI:

```json
{
  "provider": "gemini",
  "language": "nl",
  "instructionsFile": ".github/changelog-instructions.md"
}
```

Then run normally:

```sh
pnpm dlx @nyaomaru/changelog-bot --release-tag HEAD --release-name 1.0.0
```

CLI flags override config file values. To use a different file:

```sh
pnpm dlx @nyaomaru/changelog-bot --config .github/changelog-bot.json --dry-run
```

Config files use camelCase keys matching the CLI options:
`repoPath`, `changelogPath`, `baseBranch`, `provider`, `releaseTag`,
`releaseName`, `releaseBody`, `language`, `instructions`,
`instructionsFile`, `dryRun`, `dryRunJsonReport`, `failOnLlmError`,
`requireProvider`, and `noAi`. Unknown keys are rejected so typos fail fast.

### From source (local checkout)

Working in a clone? Follow the steps in [Local development setup](#local-development-setup) to install dependencies and run the CLI directly.

## Configuration

Bring your own keys and tokens as needed—`changelog-bot` only asks for what it truly uses.

- Environment variables:
  - `GITHUB_TOKEN` (required for PR creation; not required for `--dry-run`)
  - Or GitHub App auth (recommended for branding and least-privilege):
    - `CHANGELOG_BOT_APP_ID` and `CHANGELOG_BOT_APP_PRIVATE_KEY` (required)
    - `CHANGELOG_BOT_APP_INSTALLATION_ID` (optional; auto-detected per repo)
    - `CHANGELOG_BOT_API_BASE` (optional; GHES, e.g., `https://ghe.example.com/api/v3`)
  - `OPENAI_API_KEY` (optional)
  - `ANTHROPIC_API_KEY` (optional)
  - `GEMINI_API_KEY` (optional)
  - `REPO_FULL_NAME` (optional, `owner/repo`; used for link resolution)
  - `OPENAI_MODEL` (optional; defaults to `gpt-4o-mini`)
  - `ANTHROPIC_MODEL` (optional; defaults to `claude-3-5-sonnet-20240620`)
  - `GEMINI_MODEL` (optional; defaults to `gemini-3.5-flash`)

### Fallback behavior (when AI is unavailable)

- Missing AI keys or API failure does not fail the run.
- `--require-provider` makes missing provider keys fail the run.
- `--fail-on-llm-error` makes provider generation/classification failures fail the run.
- `--no-ai` skips provider generation and title classification entirely.
- If GitHub Release Notes are provided for the tag, they are used as the source of truth.
- Otherwise, a heuristic section is built from `git log` and merged PRs.
- The PR body is annotated with: “Generated without LLM. Reason: …”.
- Title classification uses the provider when available; without keys, all titles are grouped under `Chore` to remain deterministic.

## GitHub Actions integration

The published composite action installs the CLI with `pnpm dlx` and forwards
action inputs to CLI flags. The caller must check out the repository first,
preferably with `fetch-depth: 0` so tag and history lookups work. Pin `uses:` to
a tag or commit for repeatable CI.

### Release published workflow

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
      # issues: write # optional, applies labels
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
          release-body: ${{ github.event.release.body }}
          # npm-version: 0.5.x
          # minimum-package-age-days: '2'
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

`published` is the safest default for GitHub UI release flows because it also
runs when a draft release is published. Use `types: [created]` only when your
process creates non-draft releases directly and you want the changelog PR opened
before publication.

### Manual dispatch workflow

```yaml
name: Update Changelog Manually

on:
  workflow_dispatch:
    inputs:
      release_tag:
        description: Git ref or tag to generate from
        required: true
        default: HEAD
      release_name:
        description: Version label without the v prefix
        required: true
      dry_run:
        description: Print output without writing or opening a PR
        required: true
        default: 'true'

jobs:
  changelog:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      # issues: write # optional, applies labels
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }

      - uses: nyaomaru/changelog-bot@v0
        with:
          changelog-path: CHANGELOG.md
          base-branch: main
          provider: openai
          release-tag: ${{ inputs.release_tag }}
          release-name: ${{ inputs.release_name }}
          dry-run: ${{ inputs.dry_run }}
          dry-run-json-report: 'true'
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Dry-run only workflow

```yaml
name: Preview Changelog

on:
  workflow_dispatch:

jobs:
  changelog:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }

      - uses: nyaomaru/changelog-bot@v0
        with:
          release-tag: HEAD
          release-name: 0.5.0-preview
          dry-run: 'true'
          dry-run-json-report: 'true'
          no-ai: 'true'
```

Dry-runs do not write `CHANGELOG.md`, push a branch, or create a PR, so they do
not need `GITHUB_TOKEN` unless you want authenticated GitHub API lookups for a
private repository.

### Reusable workflow

```yaml
jobs:
  changelog:
    uses: nyaomaru/changelog-bot/.github/workflows/changelog.yaml@main
    permissions:
      contents: write
      pull-requests: write
      # issues: write # optional, applies labels
    with:
      changelog_path: CHANGELOG.md
      # config_path: .github/changelog-bot.json
      base_branch: main
      provider: openai
      release_tag: ${{ github.event.release.tag_name }}
      release_name: ${{ github.event.release.tag_name }}
      # release_body: '...'
      # language: ja
      # instructions_file: .github/changelog-instructions.md
      # npm_version: 0.5.x
      # minimum_package_age_days: '2'
      # dry_run: 'true'
      # dry_run_json_report: 'true'
      # fail_on_llm_error: 'true'
      # require_provider: 'true'
      # no_ai: 'true'
    secrets:
      REPO_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      # ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      # GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```

### Action inputs and CLI flags

Boolean action and reusable workflow inputs are strings: use `'true'` or
`'false'`. Omitted CLI-backed inputs keep CLI/config-file defaults. Explicit
action values are forwarded as CLI flags and override config-file values.

| Purpose                 | CLI flag                                             | Action input               | Reusable workflow input    | Config key / default                                        |
| ----------------------- | ---------------------------------------------------- | -------------------------- | -------------------------- | ----------------------------------------------------------- |
| Config file             | `--config`                                           | `config-path`              | `config_path`              | auto-loads `changelog-bot.config.json` when present         |
| Repository path         | `--repo-path`                                        | none                       | none                       | `repoPath`, default `.`; actions run from the checkout root |
| Changelog path          | `--changelog-path`                                   | `changelog-path`           | `changelog_path`           | `changelogPath`, default `CHANGELOG.md`                     |
| PR base branch          | `--base-branch`                                      | `base-branch`              | `base_branch`              | `baseBranch`, default `main`                                |
| Provider                | `--provider`                                         | `provider`                 | `provider`                 | `provider`, default `openai`                                |
| Release ref             | `--release-tag`                                      | `release-tag`              | `release_tag`              | `releaseTag`, default latest tag or `HEAD`                  |
| Version label           | `--release-name`                                     | `release-name`             | `release_name`             | `releaseName`, derived from release ref                     |
| Release notes body      | `--release-body`                                     | `release-body`             | `release_body`             | `releaseBody`, default empty                                |
| Output language         | `--language`                                         | `language`                 | `language`                 | `language`, default `en`                                    |
| Extra instructions      | `--instructions`                                     | `instructions`             | `instructions`             | `instructions`, unset                                       |
| Instructions file       | `--instructions-file`                                | `instructions-file`        | `instructions_file`        | `instructionsFile`, unset                                   |
| Preview only            | `--dry-run` / `--no-dry-run`                         | `dry-run`                  | `dry_run`                  | `dryRun`, default `false`                                   |
| JSON dry-run report     | `--dry-run-json-report` / `--no-dry-run-json-report` | `dry-run-json-report`      | `dry_run_json_report`      | `dryRunJsonReport`, default `false`                         |
| Fail on provider errors | `--fail-on-llm-error` / `--no-fail-on-llm-error`     | `fail-on-llm-error`        | `fail_on_llm_error`        | `failOnLlmError`, default `false`                           |
| Require provider key    | `--require-provider` / `--no-require-provider`       | `require-provider`         | `require_provider`         | `requireProvider`, default `false`                          |
| Deterministic mode      | `--no-ai` / `--ai`                                   | `no-ai`                    | `no_ai`                    | `noAi`, default `false`                                     |
| CLI package version     | none                                                 | `npm-version`              | `npm_version`              | Action-only, default `latest`                               |
| Package age guard       | none                                                 | `minimum-package-age-days` | `minimum_package_age_days` | Action-only, default `0`                                    |

Outputs: None.

### Package install guard

The action installs `@nyaomaru/changelog-bot` with `pnpm dlx`. By default,
`minimum-package-age-days` is `0`, which disables pnpm's `minimumReleaseAge`
guard. Set it to a positive integer, such as `'2'`, to block package versions
published less than that many days ago. The action forwards the value through
pnpm's runtime config flag, `--config.minimum-release-age=...`.

If you run the CLI directly with `npx`, this action-level guard does not apply.
Use `pnpm dlx` with `minimumReleaseAge`, or pin an exact version yourself if you
want the same protection.

### Authentication and permissions

For non-dry-run PR creation, provide either `GITHUB_TOKEN`/PAT or GitHub App
credentials. `GITHUB_TOKEN` takes precedence when both are present.

Workflow permissions for `GITHUB_TOKEN`:

- `contents: write` to commit and push the changelog branch.
- `pull-requests: write` to open the PR.
- `issues: write` is optional; without it, the PR is still created but labels are skipped with a warning.

Fine-grained PAT or GitHub App permissions:

- Repository contents: read and write.
- Pull requests: read and write.
- Issues: read and write, optional for labels.
- Metadata: read, included by GitHub Apps.

Set `REPO_FULL_NAME` manually only when running the CLI directly outside GitHub
Actions. The composite action sets it from `github.repository`.

### GitHub App authentication

Use a GitHub App when PRs should be authored by the App account and scoped to
least privilege. Do not set `GITHUB_TOKEN` on the same step if you want the App
path to be used.

```yaml
name: Update Changelog (App Auth)

on:
  release:
    types: [published]

jobs:
  changelog:
    runs-on: ubuntu-latest
    permissions:
      contents: write # to push branch
      pull-requests: write # to open PR
      # issues: write # optional, applies labels
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
        env:
          CHANGELOG_BOT_APP_ID: ${{ secrets.CHANGELOG_BOT_APP_ID }}
          CHANGELOG_BOT_APP_PRIVATE_KEY: ${{ secrets.CHANGELOG_BOT_APP_PRIVATE_KEY }}
          # CHANGELOG_BOT_APP_INSTALLATION_ID: ${{ secrets.CHANGELOG_BOT_APP_INSTALLATION_ID }}
          # CHANGELOG_BOT_API_BASE: https://ghe.example.com/api/v3
          # OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

You can also use App auth through the reusable workflow:

```yaml
jobs:
  changelog:
    uses: nyaomaru/changelog-bot/.github/workflows/changelog.yaml@main
    permissions:
      contents: write
      pull-requests: write
      # issues: write # optional, applies labels
    with:
      release_tag: ${{ github.event.release.tag_name }}
      release_name: ${{ github.event.release.tag_name }}
    secrets:
      CHANGELOG_BOT_APP_ID: ${{ secrets.CHANGELOG_BOT_APP_ID }}
      CHANGELOG_BOT_APP_PRIVATE_KEY: ${{ secrets.CHANGELOG_BOT_APP_PRIVATE_KEY }}
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

Notes

- Paste the App private key into a repository/organization secret as a multiline PEM; secrets preserve newlines.
- Single-line secrets with escaped `\n` are also accepted.
- `CHANGELOG_BOT_APP_INSTALLATION_ID` is optional; the CLI auto-detects it from the repository.
- `CHANGELOG_BOT_API_BASE` can point to a GHES REST API base, such as `https://ghe.example.com/api/v3`.

Set the following in your workflow or environment (use aliases; no `GITHUB_` prefix required):

```sh
export CHANGELOG_BOT_APP_ID=123456
export CHANGELOG_BOT_APP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
# Optional: hardcode installation id; otherwise we auto-detect from the repo
# export CHANGELOG_BOT_APP_INSTALLATION_ID=987654
```

The CLI exchanges the App credentials for an installation access token at runtime and uses it for:

- GitHub REST calls (PR lookups, release notes fetch)
- PR creation (Octokit)

Token rotation: We mint a fresh installation token per CLI run. Tokens expire in ~1 hour; no manual rotation required.

## Troubleshooting

- `Resource not accessible by integration`: add `contents: write` and `pull-requests: write`; for reusable workflows, set these on the calling job because caller permissions cap the nested workflow. Add `issues: write` only if labels must be applied.
- Label application warning: add `issues: write` to the workflow job or GitHub App/PAT if labels are required. Without it, changelog-bot still creates the PR.
- `GITHUB_TOKEN is required to create PR`: non-dry-run mode needs `GITHUB_TOKEN`, a PAT, or GitHub App credentials. Dry-run mode does not create a PR.
- GitHub App JWT or private key errors: use `CHANGELOG_BOT_APP_ID` and `CHANGELOG_BOT_APP_PRIVATE_KEY`, keep the PEM unencrypted, and preserve newlines or use escaped `\n`.
- Missing release notes or PR titles: use `actions/checkout` with `fetch-depth: 0`, pass `release-body`, and provide GitHub auth for private repositories.
- AI key missing: the CLI falls back by default. Set the matching provider key, use `require-provider: 'true'` to fail instead, or use `no-ai: 'true'` intentionally.
- Provider API/schema failure: keep fallback behavior, or set `fail-on-llm-error: 'true'` when a deterministic failure is better than heuristic output.
- Package version is unexpectedly blocked: check `minimum-package-age-days`. The default is `0`; positive values enable the pnpm package age guard.
- No PR appears in dry-run: expected. Dry-run prints the proposed changelog and diagnostics only.
- Duplicate version heading: the changelog already contains that release. Use a different `release-name` or edit the existing section intentionally.
- Push or PR targets the wrong branch: set `base-branch` / `base_branch` to the branch that should receive the changelog PR.

## Local development setup

If you're contributing to `changelog-bot`, the repo ships a `mise.toml` to pin tool versions and expose handy tasks.

### Mise (toolchain & tasks)

- Tools: Node `22`, pnpm `11.2.2`.
- Tasks: `lint`, `build`, `test`, `test_unit`, `test_performance`, `qa`.

```sh
# Install tool versions declared in mise.toml
mise install
# Install dependencies
mise dev_install

# Run common tasks
mise build         # same as: pnpm build
mise lint          # same as: pnpm lint
mise test          # same as: pnpm test
mise qa            # runs lint, test, build in sequence
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

## Notes & FAQ

- ❓ _Do I need AI keys?_ → No. The CLI gracefully falls back to heuristic mode.
- 🔑 _Is GITHUB_TOKEN required?_ → Only when creating PRs (non-dry-run).
- 🧩 _What if my tag already exists?_ → Duplicate version headings are automatically detected and skipped.
- 🔗 _Compare links?_ → Automatically ensured and updated for every release.

**Compatibility Policy**

- During `v0`, breaking changes may occur as we stabilize flags and output. We avoid breaks when possible and document changes in the changelog.
- To pin versions:
  - Action: use a major tag (`uses: nyaomaru/changelog-bot@v0`) or a specific ref (e.g., `@v0.1.2`).
  - Action + CLI pin: set `npm-version` input (e.g., `npm-version: 0.1.2`). Set `minimum-package-age-days` to a positive value when you want pnpm to block newly published package versions.
  - npx: `npx @nyaomaru/changelog-bot@0.1.2 ...`.
- From `v1` onward, we follow SemVer: no breaking changes without a major version bump.

<p align="center">
    <img src="https://raw.githubusercontent.com/nyaomaru/changelog-bot/main/public/ChangelogBot_text.png" width="600px" align="center" alt="changelog-bot text" />
</p>
