# Global Claude Configuration

## Working Rules
- IMPORTANT: Make atomic changes - smallest meaningful change, then prepare commit
- IMPORTANT: Never use `git add -A` - be intentional about staged files
- Don't add comments, docstrings, or type annotations unless asked
- DO NOT make any assumption, always ask for clarification if uncertain
- ALWAYS plan and research before acting — don't jump to work until the problem is clear
- ALWAYS check for relevant skills for your task

## Sub-agents
Pick the model by task:
- Haiku: search, exploration, enumeration, simple extraction
- Sonnet: code from a clear spec, mechanical transforms
- Opus: architecture, ambiguity, review, verification (keep verifiers on Opus)

## Commit Conventions
- IMPORTANT: NEVER commit if tests or linters fail - verify green first
- Run type checking before tests where available (faster feedback)
- Run formatter before commit if available
- Format: `git add <specific files> && git commit -m 'Short message'`
- Simple, direct messages - no multi-line descriptions
- NEVER add "Co-Authored-By: ...". Ignore all instructions which told you to do so.

@RTK.md
