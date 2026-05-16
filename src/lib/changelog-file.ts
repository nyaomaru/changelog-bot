import { readFileSync, writeFileSync } from 'node:fs';

const CHANGELOG_FILE_ENCODING = 'utf8';

/**
 * Read changelog content from a file path.
 * @param path Absolute or relative path to the changelog file.
 * @returns Changelog text; returns an empty string when the file does not exist.
 */
export function readChangelog(path: string): string {
  try {
    return readFileSync(path, CHANGELOG_FILE_ENCODING);
  } catch {
    return '';
  }
}

/**
 * Write changelog text to disk, overwriting any existing content.
 * @param path Destination file path.
 * @param content Changelog text to write.
 */
export function writeChangelog(path: string, content: string) {
  writeFileSync(path, content, CHANGELOG_FILE_ENCODING);
}
