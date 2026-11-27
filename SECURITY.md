# Security

Report suspected vulnerabilities privately through [GitHub private vulnerability reporting](https://github.com/morningstarnasser/morningstar-cli/security/advisories/new). If that page is unavailable, ask for a private reporting channel without posting exploit details or secrets in a public issue. No response-time guarantee is offered.

Keep provider keys, bot tokens, configuration, sessions, memories, local environment files and infrastructure details outside this repository. Use synthetic examples in issues and tests. Review logs before sharing them.

Morningstar can read files and run commands. Use a separate project directory, review tool approvals and avoid running it as an administrator. `--yolo` bypasses permission prompts for the current run; launchers do not enable it automatically. Local models use the configured Ollama server; cloud providers send model requests to their provider. Telegram, MCP and remote control are optional integrations that require separate configuration.

Before a release, maintainers must run the checks in [the distribution guide](docs/distribution.md): working tree, staged tree, full Git history, dependency scan, actual npm archive and clean-install verification. Passing a scanner does not establish that all vulnerabilities or private data have been detected. Review the diff and every exported file as well.
