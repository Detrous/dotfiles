### Git Commit Guidelines
- Keep commit messages short and concise (1 line)
- No additional descriptions or explanations in commit messages
- Focus on what changed, not why

### Development Approach - Changes/Refactoring/Features
- **Always make the smallest change possible** - Break down work into minimal, atomic changes
- **Keep tests green** - Ensure all tests pass after each change. Never leave tests broken between iterations
- **Iterative approach mandatory** - NEVER perform global changes at once. Instead:
  1. Make one small, focused change
  2. Fix any broken tests immediately
  3. Commit the working state
  4. Move to the next small change
- **Each iteration must be complete** - Every change should leave the codebase in a working state
- **Commit frequently** - After each successful iteration with passing tests, commit before proceeding
- **Auto-commit after completing tasks** - When you complete a task (especially when using TodoWrite), immediately commit ONLY the files you modified. Use `git add <specific files>` then `git commit` with a concise message. NEVER use `git add -A` or `git add .` as this may stage unrelated changes

### Task Planning & Execution
- **Understand before coding** - First understand current architecture, identify files to modify
- **Plan and get approval** - Create a plan with architectural considerations and edge cases. Get user approval before writing code
- **Use TodoWrite for complex tasks** - Create todo lists for multi-step tasks and get approval before starting
- **Break down large tasks** - If a task is too vague or large, ask user to help break it down
- **Ask clarifying questions** - Never make assumptions. Get clarity before starting

### Code Quality & Testing
- **Read entire files** - Don't skim. You'll miss existing code, patterns, or architecture
- **Run linting after changes** - Always verify syntax and style compliance
- **Optimize for readability** - Code is read more than written
- **No dummy implementations** - Always implement fully working code
- **Follow existing patterns** - Match the codebase's style, libraries, and conventions

### Tool Usage
- **MCP Tools:**
  - Sequential-thinking: Use for complex problem planning
  - Context7: Use for library documentation lookup
- **Documentation lookup:**
  - First try context7 MCP for library docs
  - Fallback to WebSearch or GitHub repository docs
  - Never assume library APIs - always verify current syntax
- **Search before implementing**

### Communication Style
- Be concise and direct
- Avoid unnecessary apologies or explanations
