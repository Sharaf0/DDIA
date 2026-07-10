---
emoji: 🔒
description: Daily security vulnerability scanner using CodeQL and Dependabot alerts. Creates issues per vulnerability, deduplicates, auto-closes resolved vulns, and posts beautiful all-clear summaries.
on:
  schedule:
    - cron: '0 9 * * 1-5'
  workflow_dispatch:
permissions:
  contents: read
  issues: write
  pull-requests: read
  security-events: read
tools:
  github:
    mode: gh-proxy
    toolsets: [default]
steps:
  - name: Fetch security alerts
    run: |
      mkdir -p /tmp/gh-aw/data
      
      # Fetch CodeQL code scanning alerts
      echo "Fetching CodeQL alerts..."
      gh code-scanning list --state open --format json > /tmp/gh-aw/data/codeql-alerts.json 2>/dev/null || echo '[]' > /tmp/gh-aw/data/codeql-alerts.json
      
      # Fetch Dependabot alerts
      echo "Fetching Dependabot alerts..."
      gh dependabot list --state open --format json > /tmp/gh-aw/data/dependabot-alerts.json 2>/dev/null || echo '[]' > /tmp/gh-aw/data/dependabot-alerts.json
      
      # Fetch all open issues for comprehensive deduplication
      echo "Fetching existing issues..."
      gh issue list --state open --format json --limit 200 > /tmp/gh-aw/data/all-open-issues.json 2>/dev/null || echo '[]' > /tmp/gh-aw/data/all-open-issues.json
safe-outputs:
  - create-issue
  - add-comment
  - add-labels
  - close-issue
network:
  allowed:
    - defaults
---

# Daily Security Vulnerability Checker 🔒

## Task

Scan CodeQL and Dependabot alerts daily and intelligently manage security vulnerability issues:

1. **Parse alerts** from `/tmp/gh-aw/data/codeql-alerts.json` and `/tmp/gh-aw/data/dependabot-alerts.json`
2. **Deduplicate** against existing issues in `/tmp/gh-aw/data/all-open-issues.json`:
   - For Dependabot: Match by package name + version + advisory ID
   - For CodeQL: Match by rule ID + severity + file path
3. **Create new issues** for vulnerabilities not already tracked:
   - Title: `[SEVERITY] Package vulnerability: CVE-XXXX` (Dependabot) or `[SEVERITY] Code scanning: Rule name` (CodeQL)
   - Body: Vulnerability type, severity, affected component, description, recommended fix
   - Labels: Always add `security`, `vulnerability`, `codeql` or `dependabot`, plus severity level (`critical`, `high`, `medium`, `low`)
4. **Add detailed remediation comments** to each new issue with step-by-step fix instructions and timelines
5. **Auto-close resolved vulnerabilities**: Check if previously tracked issues no longer appear in current alerts; close them with message: "✅ This vulnerability has been resolved in the latest code. Closing this issue."
6. **Post all-clear notification**: If no new vulnerabilities, call `noop` with reason; if all vulns resolved, mention closed issues

## Safe Outputs

Use only these safe outputs for all write actions:
- `create-issue`: New vulnerability issues
- `add-comment`: Remediation details and step-by-step fix instructions
- `add-labels`: Security labels and severity labels
- `close-issue`: Resolved vulnerabilities
- `noop`: When no action is needed (no new vulns, no resolved vulns)

## Guidelines

- **No PR blocking**: Advisory mode only—issues inform but don't block merges
- **Deduplication is critical**: Always check existing issues before creating new ones
- **Beautiful messaging**: When no vulnerabilities found, post a clear, positive summary
- **Intelligent closing**: Only close issues when the underlying vulnerability is actually resolved
- **Comprehensive remediation**: Include version upgrade recommendations, timeline guidance, and links to advisories
