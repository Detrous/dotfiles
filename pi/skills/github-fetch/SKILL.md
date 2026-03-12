---
name: github-fetch
description: Use when you need to read or inspect GitHub repositories, pull requests, issues, workflow runs, releases, commits, or GitHub API data. Prefer the gh CLI through bash instead of curl, wget, or raw HTTP requests. Keep operations read-only unless the user explicitly asks for a write action.
---

# GitHub Fetch

Use `gh` via `bash` for all GitHub data access.

## Commands

Prefer higher-level subcommands first:

```bash
gh repo view owner/repo
gh pr view 123 --repo owner/repo
gh pr list --repo owner/repo
gh issue view 123 --repo owner/repo
gh issue list --repo owner/repo
gh run list --repo owner/repo
gh run view <run-id> --repo owner/repo
gh release view --repo owner/repo
gh release list --repo owner/repo
```

Use `gh api` when subcommands don't cover the need:

```bash
gh api repos/owner/repo
gh api repos/owner/repo/commits
gh api repos/owner/repo/pulls/123
```

## Rules

- Always pass `--repo owner/name` so commands work outside a checked-out repo
- Prefer `--json` for structured output, combine with `--jq` to filter
- Do **not** use mutating operations unless the user explicitly asks:
  - no `gh pr merge`
  - no `gh issue comment`
  - no `gh api -X POST/PATCH/DELETE`
- Do **not** fall back to `curl` or `wget` for GitHub data; if `gh` auth or access fails, report the error clearly
