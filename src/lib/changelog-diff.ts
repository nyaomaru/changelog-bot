/**
 * Create a simple unified-style diff between two strings.
 * @param oldText Original text (left side).
 * @param newText Updated text (right side).
 * @returns Unified diff as a string with simple +/-/ context lines.
 */
export function diffChangelog(oldText: string, newText: string): string {
  const header = ['--- a/CHANGELOG.md', '+++ b/CHANGELOG.md'];
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  const oldLen = oldLines.length;
  const newLen = newLines.length;

  // Fast paths / early returns
  if (oldText === newText) {
    return header.concat(oldLines.map((line) => ' ' + line)).join('\n');
  }
  if (oldLen === 0 && newLen === 0) {
    return header.join('\n');
  }
  if (oldLen === 0) {
    return header.concat(newLines.map((line) => '+' + line)).join('\n');
  }
  if (newLen === 0) {
    return header.concat(oldLines.map((line) => '-' + line)).join('\n');
  }

  // Build the Longest Common Subsequence (LCS) matrix.
  const lcs: number[][] = Array.from({ length: oldLen + 1 }, () =>
    Array(newLen + 1).fill(0),
  );
  for (let oldIdx = oldLen - 1; oldIdx >= 0; oldIdx--) {
    for (let newIdx = newLen - 1; newIdx >= 0; newIdx--) {
      if (oldLines[oldIdx] === newLines[newIdx]) {
        lcs[oldIdx][newIdx] = lcs[oldIdx + 1][newIdx + 1] + 1;
      } else {
        lcs[oldIdx][newIdx] = Math.max(
          lcs[oldIdx + 1][newIdx],
          lcs[oldIdx][newIdx + 1],
        );
      }
    }
  }

  // Reconstruct diff from the LCS matrix.
  const diffLines: string[] = [...header];
  const addContext = (line: string) => diffLines.push(' ' + line);
  const addRemoval = (line: string) => diffLines.push('-' + line);
  const addAddition = (line: string) => diffLines.push('+' + line);

  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < oldLen && newIndex < newLen) {
    if (oldLines[oldIndex] === newLines[newIndex]) {
      addContext(oldLines[oldIndex]);
      oldIndex++;
      newIndex++;
    } else if (lcs[oldIndex + 1][newIndex] >= lcs[oldIndex][newIndex + 1]) {
      addRemoval(oldLines[oldIndex]);
      oldIndex++;
    } else {
      addAddition(newLines[newIndex]);
      newIndex++;
    }
  }
  while (oldIndex < oldLen) {
    addRemoval(oldLines[oldIndex]);
    oldIndex++;
  }
  while (newIndex < newLen) {
    addAddition(newLines[newIndex]);
    newIndex++;
  }
  return diffLines.join('\n');
}
