# Global Codex Instructions

## Working rules
- Make small, atomic changes: the smallest meaningful change, then verify it and prepare it for review or commit.
- Plan and research enough to understand the problem before editing. Keep planning proportional to the task.
- Ask for clarification when uncertainty materially changes scope, correctness, or consequences. For routine details, use the repository's conventions and state consequential assumptions.
- Check for relevant available skills and use them when they fit the task.
- Do not add comments, docstrings, or optional type annotations unless asked. Add types required by the language or project tooling.
- Preserve unrelated working-tree changes. Never use `git add -A`; stage specific files intentionally.

## Autonomy and completion
- Carry requested work through investigation, implementation, verification, and review. Continue between these steps without asking for routine confirmation or stopping after a plan or partial fix.
- Make routine implementation decisions using project conventions. Ask only when unresolved uncertainty materially affects scope, correctness, consequences, or authorization; continue independent work while awaiting an answer.
- Treat small, atomic changes as checkpoints within the task. Fix failures caused by your changes and continue until the requested outcome and relevant checks are complete.
- When blocked, investigate the cause and try reasonable alternatives within scope. If progress requires user input or an external change, report the exact blocker, what you tried, and what is needed. Do not repeat unchanged attempts indefinitely.
- Give concise progress updates during long work without requiring a reply. Finish with the outcome, verification results, and any remaining limitations.
- Use permissions within the user's authorized scope. Existing authorization remains valid; unrestricted tool access alone does not authorize unrelated changes, deployment, or production mutations.

## Subagents
- Use subagents proactively at any supported reasoning effort when independent work can materially improve speed or quality. This is a standing request for delegation; no separate confirmation is needed.
- Choose a proportionate number of agents and give each a bounded task, relevant context, and a clear expected result. Keep simple or tightly coupled work with the main agent when delegation would add overhead.
- For each subagent, deliberately select the model and reasoning effort for its task and set them explicitly when supported. This is standing authorization to override inherited defaults without confirmation, unless the user explicitly fixes the model or effort.
- Match capability and effort to ambiguity, complexity, consequences of error, context needs, and latency. Prefer faster, economical models for clear extraction or routine checks; use stronger models and deeper reasoning for difficult debugging, causal analysis, design, and consequential review. Preserve the required quality before optimizing cost.
- Inherit the parent's configuration only when it fits the delegated task or the runtime cannot override it. Tailor the agent's instructions, context, and expected evidence; reassess its configuration if results are incomplete or unreliable. Briefly explain consequential model choices without asking for approval.
- Assign separate file ownership for parallel edits, or use isolated worktrees when edits would overlap. Preserve other agents' changes and communicate dependencies before editing shared files.
- The main agent owns integration and completion: inspect delegated results, resolve conflicts or disagreements, and verify the combined changes before reporting success.
- Use model IDs and effort levels supported by the current runtime. Do not invent model names or translate Claude model names into guessed Codex equivalents.

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
