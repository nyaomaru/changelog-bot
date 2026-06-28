import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from '@jest/globals';

const REPO_ROOT = process.cwd();
const README_CONTRACT_HEADING =
  '### Public contract: CLI, Action, reusable workflow, and config';

type ContractRow = {
  /** Human-readable table purpose from README. */
  purpose: string;
  /** CLI flags listed in the public contract table. */
  cliFlags: string[];
  /** Composite action input listed in the public contract table. */
  actionInput?: string;
  /** Reusable workflow input listed in the public contract table. */
  workflowInput?: string;
  /** Config key listed in the public contract table. */
  configKey?: string;
};

function readRepoFile(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function extractCodeSpans(markdownCell: string): string[] {
  return [...markdownCell.matchAll(/`([^`]+)`/g)].map(
    (codeSpanMatch) => codeSpanMatch[1],
  );
}

function extractPublicContractRows(readmeText: string): ContractRow[] {
  const tableStart = readmeText.indexOf(README_CONTRACT_HEADING);
  if (tableStart === -1) {
    throw new Error(`Missing README heading: ${README_CONTRACT_HEADING}`);
  }

  const outputsStart = readmeText.indexOf('Outputs: None.', tableStart);
  if (outputsStart === -1) {
    throw new Error('Missing README public contract table terminator');
  }

  return readmeText
    .slice(tableStart, outputsStart)
    .split('\n')
    .filter((line) => line.startsWith('| ') && !line.includes('---'))
    .slice(1)
    .map((line) => {
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim());
      const [purpose, cliCell, actionCell, workflowCell, configCell] = cells;
      const configCodeSpans = extractCodeSpans(configCell);

      return {
        purpose,
        cliFlags: extractCodeSpans(cliCell).filter((codeSpan) =>
          codeSpan.startsWith('--'),
        ),
        ...(actionCell === 'none'
          ? {}
          : { actionInput: extractCodeSpans(actionCell)[0] }),
        ...(workflowCell === 'none'
          ? {}
          : { workflowInput: extractCodeSpans(workflowCell)[0] }),
        ...(purpose === 'Config file' || configCell.startsWith('Action-only')
          ? {}
          : { configKey: configCodeSpans[0] }),
      };
    });
}

function cliFlagToYargsOption(cliFlag: string): string {
  const flagName = cliFlag.replace(/^--/, '');
  return flagName.startsWith('no-') ? flagName.slice(3) : flagName;
}

function extractYargsOptions(cliArgsSource: string): string[] {
  return uniqueSorted(
    [...cliArgsSource.matchAll(/\.option\('([^']+)'/g)].map(
      (optionMatch) => optionMatch[1],
    ),
  );
}

function extractConfigSchemaKeys(configSchemaSource: string): string[] {
  const objectStart = configSchemaSource.indexOf('.object({');
  const objectEnd = configSchemaSource.indexOf('  })', objectStart);
  if (objectStart === -1 || objectEnd === -1) {
    throw new Error('Could not find config schema object');
  }

  return uniqueSorted(
    [
      ...configSchemaSource
        .slice(objectStart, objectEnd)
        .matchAll(/^ {4}(\w+):/gm),
    ].map((keyMatch) => keyMatch[1]),
  );
}

function extractActionInputs(actionYaml: string): string[] {
  const inputsStart = actionYaml.indexOf('inputs:\n');
  const runsStart = actionYaml.indexOf('\nruns:', inputsStart);
  if (inputsStart === -1 || runsStart === -1) {
    throw new Error('Could not find action inputs block');
  }

  return uniqueSorted(
    [
      ...actionYaml
        .slice(inputsStart, runsStart)
        .matchAll(/^ {2}([a-z0-9-]+):$/gm),
    ].map((inputMatch) => inputMatch[1]),
  );
}

function extractWorkflowInputs(workflowYaml: string): string[] {
  const inputsStart = workflowYaml.indexOf('    inputs:\n');
  const secretsStart = workflowYaml.indexOf('    secrets:', inputsStart);
  if (inputsStart === -1 || secretsStart === -1) {
    throw new Error('Could not find reusable workflow inputs block');
  }

  return uniqueSorted(
    [
      ...workflowYaml
        .slice(inputsStart, secretsStart)
        .matchAll(/^ {6}([a-z0-9_]+):$/gm),
    ].map((inputMatch) => inputMatch[1]),
  );
}

describe('public contract parity', () => {
  const contractRows = extractPublicContractRows(readRepoFile('README.md'));

  test('README public contract table covers CLI flags parsed by yargs', () => {
    const documentedCliOptions = uniqueSorted(
      contractRows.flatMap((row) => row.cliFlags.map(cliFlagToYargsOption)),
    );
    const yargsOptions = extractYargsOptions(
      readRepoFile('src/lib/cli-args.ts'),
    );

    expect(documentedCliOptions).toEqual(yargsOptions);
  });

  test('README public contract table covers config file keys', () => {
    const documentedConfigKeys = uniqueSorted(
      contractRows
        .map((row) => row.configKey)
        .filter((configKey): configKey is string => Boolean(configKey)),
    );
    const schemaKeys = extractConfigSchemaKeys(
      readRepoFile('src/schema/config-file.ts'),
    );

    expect(documentedConfigKeys).toEqual(schemaKeys);
  });

  test('README public contract table covers action inputs', () => {
    const documentedActionInputs = uniqueSorted(
      contractRows
        .map((row) => row.actionInput)
        .filter((actionInput): actionInput is string => Boolean(actionInput)),
    );
    const actionInputs = extractActionInputs(readRepoFile('action.yml'));

    expect(documentedActionInputs).toEqual(actionInputs);
  });

  test('README public contract table covers reusable workflow inputs', () => {
    const documentedWorkflowInputs = uniqueSorted(
      contractRows
        .map((row) => row.workflowInput)
        .filter((workflowInput): workflowInput is string =>
          Boolean(workflowInput),
        ),
    );
    const workflowInputs = extractWorkflowInputs(
      readRepoFile('.github/workflows/changelog.yaml'),
    );

    expect(documentedWorkflowInputs).toEqual(workflowInputs);
  });

  test('action and reusable workflow expose the same public inputs', () => {
    const actionInputs = extractActionInputs(readRepoFile('action.yml'));
    const workflowInputs = extractWorkflowInputs(
      readRepoFile('.github/workflows/changelog.yaml'),
    );
    const workflowInputsAsActionNames = workflowInputs.map((workflowInput) =>
      workflowInput.replaceAll('_', '-'),
    );

    expect(uniqueSorted(workflowInputsAsActionNames)).toEqual(actionInputs);
  });
});
