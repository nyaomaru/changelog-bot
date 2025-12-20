#!/usr/bin/env node

import { runCli } from './index.js';
import { mapErrorToExitCode } from '@/lib/errors.js';

// WHY: Splitting the executable wrapper keeps the shebang intact without polluting the reusable CLI module.
runCli().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  const code = mapErrorToExitCode(error);
  process.exit(code);
});
