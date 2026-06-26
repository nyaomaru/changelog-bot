import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

export const CUSTOM_INSTRUCTIONS_ENCODING = 'utf8';
export const CUSTOM_INSTRUCTIONS_MAX_CHARS = 16_000;

/** Resolved status for the optional customization instructions file. */
export type CustomInstructionsFileStatus =
  | 'not_provided'
  | 'loaded'
  | 'empty'
  | 'read_failed';

/** Inputs used to resolve optional changelog customization instructions. */
export type ResolveCustomInstructionsInput = {
  /** Inline instructions passed through the CLI or Action input. */
  instructions?: string;
  /** Path to an instructions file, relative to repoPath unless absolute. */
  instructionsFile?: string;
  /** Repository root used to resolve relative instruction file paths. */
  repoPath: string;
};

/** Diagnostics for resolved prompt customization instructions. */
export type CustomInstructionsDiagnostics = {
  /** Whether inline or file customization was requested. */
  requested: boolean;
  /** Whether non-empty customization text is available for the prompt. */
  resolved: boolean;
  /** Instruction sources that contributed text after normalization. */
  sources: Array<'inline' | 'file'>;
  /** Character count after normalization and optional truncation. */
  chars: number;
  /** Maximum combined instruction length accepted by the prompt builder. */
  maxChars: number;
  /** Encoding used when reading the instructions file. */
  encoding: typeof CUSTOM_INSTRUCTIONS_ENCODING;
  /** Whether combined instructions were truncated to maxChars. */
  truncated: boolean;
  /** File status after reading and normalization. */
  fileStatus: CustomInstructionsFileStatus;
  /** Original instructions file path, when provided. */
  filePath?: string;
  /** Non-fatal file read error, when the file could not be read. */
  fileError?: string;
};

/** Resolved prompt customization and its diagnostics. */
export type CustomInstructionsResolution = {
  /** Combined instructions, or undefined when none were usable. */
  instructions?: string;
  /** Resolution diagnostics for dry-run reporting. */
  diagnostics: CustomInstructionsDiagnostics;
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
 * Resolve inline and file-based customization instructions with diagnostics.
 * Empty file content and read failures are ignored so optional customization
 * never blocks deterministic release generation.
 * @param input Inline instructions, optional file path, and repository path.
 * @returns Combined instructions plus diagnostics describing the resolution.
 */
export function resolveCustomInstructionsWithDiagnostics(
  input: ResolveCustomInstructionsInput,
): CustomInstructionsResolution {
  const inlineInstructions = normalizeInstructionText(input.instructions);
  let fileInstructions: string | undefined;
  let fileStatus: CustomInstructionsFileStatus = input.instructionsFile
    ? 'empty'
    : 'not_provided';
  let fileError: string | undefined;

  if (input.instructionsFile) {
    try {
      fileInstructions = normalizeInstructionText(
        readInstructionsFile(input.repoPath, input.instructionsFile),
      );
      fileStatus = fileInstructions ? 'loaded' : 'empty';
    } catch (error) {
      fileStatus = 'read_failed';
      fileError = error instanceof Error ? error.message : String(error);
    }
  }

  const instructionParts = [
    inlineInstructions
      ? { source: 'inline' as const, text: inlineInstructions }
      : null,
    fileInstructions
      ? { source: 'file' as const, text: fileInstructions }
      : null,
  ].filter(
    (
      instructionPart,
    ): instructionPart is { source: 'inline' | 'file'; text: string } =>
      Boolean(instructionPart),
  );

  const combinedInstructions = instructionParts
    .map((instructionPart) => instructionPart.text)
    .join('\n\n');
  const truncated = combinedInstructions.length > CUSTOM_INSTRUCTIONS_MAX_CHARS;
  const instructions = combinedInstructions
    ? combinedInstructions.slice(0, CUSTOM_INSTRUCTIONS_MAX_CHARS)
    : undefined;

  return {
    instructions,
    diagnostics: {
      requested: Boolean(input.instructions || input.instructionsFile),
      resolved: Boolean(instructions),
      sources: instructionParts.map(
        (instructionPart) => instructionPart.source,
      ),
      chars: instructions?.length ?? 0,
      maxChars: CUSTOM_INSTRUCTIONS_MAX_CHARS,
      encoding: CUSTOM_INSTRUCTIONS_ENCODING,
      truncated,
      fileStatus,
      ...(input.instructionsFile ? { filePath: input.instructionsFile } : {}),
      ...(fileError ? { fileError } : {}),
    },
  };
}

/**
 * Resolve inline and file-based customization instructions into one prompt block.
 * @param input Inline instructions, optional file path, and repository path.
 * @returns Combined instructions, or undefined when none were usable.
 */
export function resolveCustomInstructions(
  input: ResolveCustomInstructionsInput,
): string | undefined {
  return resolveCustomInstructionsWithDiagnostics(input).instructions;
}
