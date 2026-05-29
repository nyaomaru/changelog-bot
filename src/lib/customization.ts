import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

const CUSTOM_INSTRUCTIONS_ENCODING = 'utf8';

/** Inputs used to resolve optional changelog customization instructions. */
export type ResolveCustomInstructionsInput = {
  /** Inline instructions passed through the CLI or Action input. */
  instructions?: string;
  /** Path to an instructions file, relative to repoPath unless absolute. */
  instructionsFile?: string;
  /** Repository root used to resolve relative instruction file paths. */
  repoPath: string;
};

function normalizeInstructionText(text?: string): string | undefined {
  const trimmedText = text?.trim();
  return trimmedText ? trimmedText : undefined;
}

function readInstructionsFile(
  repoPath: string,
  instructionsFile: string,
): string {
  const resolvedPath = isAbsolute(instructionsFile)
    ? instructionsFile
    : join(repoPath, instructionsFile);
  return readFileSync(resolvedPath, CUSTOM_INSTRUCTIONS_ENCODING);
}

/**
 * Resolve inline and file-based customization instructions into one prompt block.
 * @param input Inline instructions, optional file path, and repository path.
 * @returns Combined instructions, or undefined when none were provided.
 */
export function resolveCustomInstructions(
  input: ResolveCustomInstructionsInput,
): string | undefined {
  const instructionParts = [
    normalizeInstructionText(input.instructions),
    input.instructionsFile
      ? normalizeInstructionText(
          readInstructionsFile(input.repoPath, input.instructionsFile),
        )
      : undefined,
  ].filter((instructionPart): instructionPart is string =>
    Boolean(instructionPart),
  );

  return instructionParts.length ? instructionParts.join('\n\n') : undefined;
}
