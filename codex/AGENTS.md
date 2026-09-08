# Global Codex Instructions

## Working rules
- Make small, atomic changes: the smallest meaningful change, then verify it and prepare it for review or commit.
- Plan and research enough to understand the problem before editing. Keep planning proportional to the task.
- Ask for clarification when uncertainty materially changes scope, correctness, or consequences. For routine details, use the repository's conventions and state consequential assumptions.
- Check for relevant available skills and use them when they fit the task.
- Do not add comments, docstrings, or optional type annotations unless asked. Add types required by the language or project tooling.
- Preserve unrelated working-tree changes. Never use `git add -A`; stage specific files intentionally.

## Subagents
- Use subagents only when requested or required by applicable project instructions.
- Use the configured model by default. Do not translate Claude model names into guessed Codex equivalents.

## Verification and commits
- Run type checking before tests where available for faster feedback.
- Run the relevant tests and linters, and the formatter before committing when available.
- Never commit while required tests or linters fail. Report blockers rather than claiming verification passed.
- Commit or push when requested; preparing a change does not by itself require either action.
- Use Conventional Commits: `type(scope): short message`. Scope is optional and lowercase.
- Types: feat, fix, perf, refactor, test, docs, chore, build, ci.
- Use imperative mood, no trailing period, and a subject of at most 72 characters.
- Mark breaking changes with `type(scope)!: ...`.
- Keep commit messages simple and single-line unless the user requests more detail.
- Do not add a `Co-Authored-By` trailer.
