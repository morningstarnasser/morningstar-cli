#!/usr/bin/env node
// Updating must not depend on application dependencies or project settings.
if (process.argv[2] === 'update') {
  const { runUpdateCli } = await import('../dist/update-cli.js');
  process.exitCode = await runUpdateCli(process.argv.slice(3));
} else {
  await import('../dist/index.js');
}
