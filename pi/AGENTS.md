# Global Pi Instructions

## Priorities
- Treat these global instructions as defaults; local project instructions may refine or override them.
- If requirements are ambiguous or assumptions would be risky, ask the user instead of guessing.
- Prefer the smallest meaningful change that solves the problem.
- Avoid unrelated refactors or cleanup unless requested.

## Working Style
- Think through the plan before editing or proposing a solution.
- Preserve the existing style and structure unless asked to change it.
- Do not add explanatory comments, docstrings, or extra type annotations unless requested or required for correctness.

## Verification
- During iteration, run the smallest relevant tests for the feature or scope being changed.
- If the change is isolated and there are scoped tests for that area, prefer those during iteration.
- Before committing, run the test scope needed to be confident the change works correctly.
- Run type checking or linting before tests when useful for faster feedback, but do not treat that as full verification.
- Never claim something is verified without stating what checks were actually run.
- If full verification was not possible, say so explicitly.

## Git
- Never use `git add -A`; stage files explicitly.
- Keep commits atomic and messages short.
- Never commit when tests or linters are failing.
- Run the formatter before commit when the project uses one.
- If a task requires interacting with GitHub, prefer the `gh` CLI when available.
