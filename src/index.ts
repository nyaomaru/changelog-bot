import { parseCliArgs } from '@/lib/cli-args.js';
import { loadAppConfig } from '@/lib/app-config.js';
import { executeChangelogRun } from '@/lib/changelog-run.js';

/**
 * Runs the changelog bot CLI end-to-end.
 * @returns Promise that resolves when the CLI flow completes.
 */
export async function runCli(): Promise<void> {
  const cli = await parseCliArgs(process.argv);
  const appConfig = loadAppConfig();
  await executeChangelogRun({ cli, appConfig });
}
