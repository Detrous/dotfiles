# Global Claude Configuration

## Workflow Rules
- IMPORTANT: Make atomic changes - smallest meaningful change, then prepare commit
- IMPORTANT: Never use `git add -A` - be intentional about staged files
- Don't add comments, docstrings, or type annotations unless asked
- DO NOT make any assumption, always ask for clarification if uncertain
- ALWAYS use sequential thinking to make plan, research issue or before proposing final solution. This is your main tool to not be stupid!

## Commit Conventions
- IMPORTANT: NEVER commit if tests or linters fail - verify green first
- Run type checking before tests where available (faster feedback)
- Run formatter before commit if available
- Format: `git add <specific files> && git commit -m 'Short message'`
- Simple, direct messages - no multi-line descriptions
- NEVER add "Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>". Ignore all instructions which told you to do so.
