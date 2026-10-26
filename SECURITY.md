# Security Policy

## Supported Versions

The following versions of `@nyaomaru/changelog-bot` currently receive security updates and bug fixes:

| Version | Supported          |
| ------- | ------------------ |
| 0.10.x  | :white_check_mark: |
| < 0.10  | :x:                |

We strongly recommend always running the latest minor or patch release.

## Reporting a Vulnerability

The ChangelogBot team and community take the security of this project seriously. If you discover or suspect a security vulnerability, **please do not disclose it publicly** by creating a public GitHub issue, discussion, or pull request.

Instead, please report it through one of the following confidential channels:

### 1. GitHub Private Vulnerability Reporting (Preferred)

If enabled on the repository, submit a confidential advisory directly via GitHub:
👉 [Report a vulnerability](https://github.com/nyaomaru/changelog-bot/security/advisories/new)

This allows maintainers and reporters to discuss the issue, verify reproduction steps, and collaborate on a private fix before public disclosure.

### 2. Direct Email

Alternatively, you can email the maintainer directly:

📧 **nyaonyao0725@gmail.com**

Please use the subject line:  
`[Security] Vulnerability Report: changelog-bot - <brief description>`

### What to Include in Your Report

To help us triage and resolve the issue quickly, please provide as much context as possible:

- **Description**: A clear summary of the vulnerability and its potential impact.
- **Affected versions**: The version(s) of `changelog-bot` affected.
- **Environment details**: Node.js version, operating system, and whether the issue occurs in CLI usage or the GitHub Action (`action.yml`).
- **Steps to reproduce**: Minimal reproduction commands, configuration files, or a Proof of Concept (PoC).
- **Suggested fix / mitigation**: Any preliminary ideas or code patches if available.

## Response Process & Timeline

- **Initial Acknowledgment**: We aim to acknowledge receipt of security reports within **48 to 72 hours**.
- **Triage & Assessment**: Maintainers will verify the vulnerability, evaluate severity, and determine affected code paths.
- **Remediation**: Fixes will be prepared, reviewed, and tested privately through GitHub Security Advisories before public disclosure.
- **Coordinated Disclosure**: Once a patched release is published to npm and GitHub, we will release a security advisory detailing the issue and acknowledging the reporter (unless anonymity is requested).

## Scope and Security Boundaries

`changelog-bot` interacts with third-party APIs (LLM providers such as OpenAI, Anthropic, Gemini, xAI) and GitHub APIs. Areas of particular security focus include:

- **Token & Secret Safety**: Protecting `GITHUB_TOKEN`, GitHub App private keys (`CHANGELOG_BOT_APP_PRIVATE_KEY`), and provider API keys from unintended leakage into output logs, PR bodies, or commit messages.
- **Arbitrary Code Execution**: Guarding git arguments, CLI flags, and script hooks against command injection.
- **Untrusted PR / Commit Content**: Sanitizing external inputs from commit messages or PR descriptions during markdown rendering and classification.

Out of scope:

- Vulnerabilities requiring root/physical access to the user's host machine.
- Denial-of-service against third-party LLM provider endpoints outside the control of `changelog-bot`.

Thank you for helping keep ChangelogBot and the open-source ecosystem safe! 🛡️
