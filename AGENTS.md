# Repository Guidelines

## Project Structure & Module Organization

- `src/cli.ts`: CLI entry wrapper (shebang + error handling).
- `src/index.ts`: CLI implementation (Yargs) reused by the wrapper.
- `src/lib/*`: Git, changelog parsing/writing, PR creation.
- `src/providers/*`: LLM providers (`openai`, `anthropic`) and types.
- `src/utils/*`: Helpers (classification, release parsing, PR mapping, etc.).
- `src/schema/*`: Zod schema for LLM output.
- `dist/`: Compiled JS. Do not edit manually.
- Root: `CHANGELOG.md`, `README.md`, `.env.example`, `tsconfig.json`.

## Build, Test, and Development Commands

Prerequisite: Install the toolchain via mise. This repo pins Node and pnpm in `mise.toml`.

```sh
mise install   # installs Node 22 and pnpm 10.12
```

- `pnpm dev_install`: Install deps.
- `pnpm build`: Compile TypeScript and rewrite path aliases (`tsc`, `tsc-alias`).
- `pnpm dev`: Run the CLI from TS (`ts-node-esm`).
- `pnpm start`: Run compiled CLI (`node dist/cli.js`).
- Dry run example: `node dist/cli.js --release-tag HEAD --release-name 0.1.0 --provider openai --dry-run` (prints updated changelog without writing/PR).

### Mise Tasks

- Tools: Node `22`, pnpm `10.12`.
- Tasks: `lint`, `build`, `test`, `test_unit`, `test_performance`, `qa`.

```sh
mise run build       # compile TS
mise run lint        # lint sources
mise run test        # run tests
mise run qa          # lint + test + build
```

## Coding Style & Naming Conventions

- Language: TypeScript (ESM, `strict` mode). Imports may use `@/` alias.
- Indentation: 2 spaces; keep existing code style consistent.
- Names: `lowerCamelCase` vars/functions, `PascalCase` types/classes. File names in `kebab-case`.

### Semantic Naming (No Ellipsis Variables)

- Prefer descriptive, intent-revealing names over single-letter or ambiguous identifiers.
- Do not use placeholder variables like `s`, `m`, `x`, `y` for non-trivial values.
- Regex matches, strings, and outputs should use names like `match`, `authorMatch`, `logOutput`, `modelName`, etc.
- Arrow function parameters should be meaningful (e.g., `matchText`, `commitSha`) rather than single letters.
- Commits: Conventional Commits (e.g., `feat:`, `fix:`, `docs(changelog): vX.Y.Z`, `chore:`). Example: `fix: avoid duplicate compare link`.
- Branches: `chore/changelog-vX.Y.Z` for generated PRs; follow similar kebab-case for feature branches.

## Testing Guidelines

- No automated test runner yet. Validate via dry runs against a repo clone:
  `node dist/cli.js --release-tag vx.y.z --release-name x.y.z --dry-run`.
- If adding tests, prefer Vitest/Jest in `src/**/__tests__` with `*.test.ts`. Keep pure functions in `utils/` easy to unit test.

## Commit & Pull Request Guidelines

- Scope commits logically and use Conventional Commits. Include a brief rationale.
- PRs: include description, linked issues, and a dry-run snippet or output confirming changes to `CHANGELOG.md`.
- Ensure `pnpm build` passes and CLI runs locally. Update `README.md` if flags/behavior change.

## Security & Configuration Tips

- Required env: `GITHUB_TOKEN` for PRs; LLM: `OPENAI_API_KEY` or Anthropic key. Optional: `OPENAI_MODEL`, `REPO_FULL_NAME`.
- Use `.env.example` as reference. Never commit secrets. Select provider with `--provider openai|anthropic`.

## Documentation & Comments

- Purpose: Add JSDoc to public APIs and WHY comments to non-obvious implementations. Leave enough intent so future readers don’t have to guess.
- JSDoc: One-line summary + `@param` / `@returns` by default. Use `@example` only for broadly useful or commonly misused functions (optional). Do not use `@typeParam`.
- WHY comments: Explain “why this design/implementation” briefly. Capture performance, compatibility, background, or constraints that are not obvious from code. Place directly above the target code.
- Style: Concise, active voice, consistent terminology. Don’t restate information that TypeScript types already make obvious.

Example — logic combinator (public JSDoc):

```ts
/**
 * Combines a precondition guard with an additional refinement to narrow the type.
 * @param precondition Broad guard evaluated first; short-circuits on failure.
 * @param condition Refinement evaluated only when `precondition` passes.
 * @returns Predicate that narrows the input to a subtype.
 * // @example: include only if this utility is widely used or often misused
 */
export function and<A, B extends A>(
  precondition: Guard<A>,
  condition: Refine<A, B>
): (x: unknown) => x is B {
  /* ... */
}
```

Example — WHY comment (performance/semantics):

```ts
// WHY: For small literal sets, a linear scan with Object.is preserves exact
// equality semantics (NaN, +0/-0) without Set overhead. For larger sets,
// switch to Set membership for speed.
const ONE_OF_VALUES_LINEAR_SCAN_MAX = 8;
```

### Intent/Background (Why)

Capture the reason this exists. If there’s time-bound context or deprecation intent, say so.

```ts
/**
 * Get congested time slots for the expo.
 * Background: Implemented for the 2025 Osaka Expo; scheduled for removal later.
 */
const getExpoConfusedTime = (targetDate: Date): Promise<Time[]> => {
  // ...
  return confusedTimeList;
};
```

### Contract (JSDoc/TSDoc)

Document the interface of the function with `@param` / `@returns`. Add `@example` when it materially helps.

```ts
/**
 * Get congested time slots for the expo.
 * Background: Implemented for the 2025 Osaka Expo; scheduled for removal later.
 * @param targetDate Target date to retrieve congested time windows for.
 * @returns Array of congested time windows.
 */
const getExpoConfusedTime = (targetDate: Date): Promise<Time[]> => {
  /* ... */
};
```

### Tagged comments

- TODO: Work planned for later
- FIXME: Known issue or temporary workaround
- HACK: Necessary but non-ideal code
- NOTE: Design rationale or reference info

```ts
/**
 * Get congested time slots for the expo.
 * Background: Implemented for the 2025 Osaka Expo.
 * TODO: Remove after the event ends.
 * @param targetDate Target date to retrieve congested time windows for.
 * @returns Array of congested time windows.
 */
```

### Directive comments

When using `eslint-disable` or `@ts-ignore`, always include a neighboring WHY comment explaining the suppression.

```ts
// HACK: Accept any due to unknown legacy type surface; tracked in issue #123.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleLegacyData(data: any) {
  // @ts-ignore: Third-party typings are outdated; safe in our usage context.
  someLegacyLibrary.doSomething(data);
}
```

### Reference links

Link issues/PRs/specs with `@see` so readers can follow the context.

```ts
/**
 * Task executed during build.
 * Used to address the following issue.
 * @see https://github.com/your-org/your-repo/issues/123
 */
```

Scope guidelines:

- Public exports: Always include JSDoc, and add WHY where non-obvious.
- Internal utilities: Add brief JSDoc/WHY when used across modules or when behavior is tricky.
- Avoid trivial inline comments; concentrate where they prevent misunderstandings or regressions.

Note: See `.github/prompts/jsdoc.prompt.md` for additional tone/phrasing inspiration.
