# Public release hygiene

This source distribution includes application code, tests, generated CLI output,
user guides and public brand assets. Model weights, account credentials, installed
skills, vault contents, runtime sessions, monitoring targets, screenshots of
operator sessions and host configuration are not bundled. Configure integrations
locally with your own credentials and endpoints.

Before publishing:

1. Review the staged diff and regenerate `dist/` with `npm run build`.
2. Run `node scripts/check-public-hygiene.mjs` against the staged tree. It also
   checks generated files and maps; findings contain filenames, not secret values.
3. Scan the exact export and all publishable Git history with Gitleaks.
4. Run `osv-scanner scan source -r .`, typecheck, tests and the website build.
5. Inspect the `npm pack --dry-run --json` manifest and scan an extracted package.
6. Confirm the public branch has only reviewed public ancestors and no unintended
   tags, source archives or private remotes in published documentation.

The hygiene script is a guard against common accidental exports, not a complete
secret detector. Gitleaks and manual review remain separate checks. Keep test
fixtures synthetic and examples on reserved domains or loopback addresses.
Public copyright and project attribution are retained.
