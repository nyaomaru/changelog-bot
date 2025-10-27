#!/usr/bin/env node

import { runCli } from './index.js';

// WHY: Splitting the executable wrapper keeps the shebang intact without polluting the reusable CLI module.
runCli().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
