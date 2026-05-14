# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview
This is a personal dotfiles repository for managing configuration files across development tools. It uses symlinks to connect versioned configurations to their expected locations in the home directory.

## Setup and Installation
- **Main setup command**: `./setup.sh` - Creates symlinks for all configuration files
  - Removes existing symlinks/files before creating new ones
  - Links Claude configuration from `claude/` to `~/.claude/` (including skills)
  - Links Neovim (LazyVim) configuration from `nvim/` to `~/.config/nvim/`
  - Links Zed editor configuration from `zed/config/` to `~/.config/zed/`
  - Links Pi extensions directory from `pi/extensions/` to `~/.pi/agent/extensions/` (dotfiles is source of truth)
  - Links Pi skills directory from `pi/skills/` to `~/.pi/agent/skills/` (dotfiles is source of truth)
  - Links Pi prompts directory from `pi/prompts/` to `~/.pi/agent/prompts/` (dotfiles is source of truth)
  - Links Pi global context from `pi/AGENTS.md` to `~/.pi/agent/AGENTS.md`

## Repository Structure
```
dotfiles/
├── claude/           # Claude AI configuration
│   ├── CLAUDE.md     # Global coding guidelines (symlinked to ~/.claude/)
│   ├── settings.json # Claude permissions and allowed commands
│   ├── settings.local.json # Local permission overrides (not tracked in git)
│   ├── commands/     # Custom Claude commands
│   │   ├── learn.md          # Session summary command template
│   │   ├── run.md            # Structured task execution command
│   │   ├── sync-settings.md  # Sync local permissions to global settings
│   │   └── update-claude-md.md  # Update project CLAUDE.md files
│   ├── hooks/        # Pre/post action hooks
│   │   └── pre-user-prompt-submit.py  # Hook executed before user prompts
│   └── skills/       # Claude Code skills (symlinked to ~/.claude/skills/)
├── pi/               # Pi coding agent configuration
│   ├── AGENTS.md     # Global agent guidelines (symlinked to ~/.pi/agent/AGENTS.md)
│   ├── extensions/   # TypeScript extensions (symlinked to ~/.pi/agent/extensions/)
│   │   └── ask-user.ts  # Interactive TUI question tool for the LLM
│   ├── prompts/      # Pi prompt templates (symlinked to ~/.pi/agent/prompts/)
│   │   └── save-plan.md  # Plan-saving prompt template
│   └── skills/       # Pi skills (symlinked to ~/.pi/agent/skills/)
│       └── github-fetch/  # Use gh CLI to read GitHub repos, PRs, issues, runs, releases
├── nvim/             # Neovim configuration (LazyVim starter, symlinked to ~/.config/nvim/)
│   ├── init.lua      # Entry point — bootstraps lazy.nvim + LazyVim
│   ├── lazyvim.json  # Selected LazyVim Extras (lang.rust, lang.typescript, lang.kotlin, etc.)
│   ├── lazy-lock.json  # Pinned plugin versions for reproducible installs
│   └── lua/
│       ├── kotlin_test.lua  # Tree-sitter Kotlin test runner (run test/class/main via Gradle/Maven)
│       ├── config/   # Core config (autocmds, keymaps, options, lazy.lua)
│       └── plugins/  # Custom plugin specs
│           └── kotlin.lua  # Swaps community kotlin LS for official JetBrains kotlin-lsp
├── zed/              # Zed editor files
│   ├── config/       # Zed configuration
│   │   ├── keymap.json
│   │   ├── settings.json
│   │   └── tasks.json
│   └── plugins/      # Zed plugins (git submodules)
│       └── claude-code-zed/  # Claude Code integration for Zed
└── setup.sh          # Setup script for creating symlinks
```

## Custom Claude Commands
- `/learn` - Generate session summaries and learnings
- `/run` - Execute structured tasks with iterative commits
- `/sync-settings` - Sync local permission overrides to global settings
- `/update-claude-md` - Update project CLAUDE.md documentation

## Hooks
- **pre-user-prompt-submit.py** - Validates and enhances user prompts before execution

## Neovim Kotlin Test Runner
- `nvim/lua/kotlin_test.lua` finds the test block under the cursor via tree-sitter and runs it through Gradle (or Maven), with multi-module detection. Buffer-local keymaps (kotlin filetype) are set in `nvim/lua/config/autocmds.lua`: `<leader>tr` nearest test/main, `<leader>tc` test class, `<leader>ta` all tests, `<leader>tt` task picker, `<leader>tl` re-run last.
- `vim.o.exrc` is enabled (`nvim/lua/config/options.lua`) so a repo can drop a `.nvim.lua` calling `require("kotlin_test").register_project_tasks{...}` to add repo-specific entries to the `<leader>tt` picker. exrc files are trusted on first use.

## Development Workflow
1. Edit configuration files in this repository
2. Run `./setup.sh` to update symlinks
3. Commit changes following the guidelines in `claude/CLAUDE.md`

## Commit Message Conventions
Use prefixes to indicate which component is being modified:
- `Zed:` - Changes to Zed editor configuration or plugins
- `Nvim:` - Changes to Neovim / LazyVim configuration
- `Claude:` - Changes to Claude configuration, commands, or hooks
- `Pi:` - Changes to Pi agent extensions or configuration
- `Setup:` - Changes to setup scripts or installation process
- `Docs:` - Documentation updates

Examples:
- `Zed: Enable claude-code-server for Kotlin files`
- `Claude: Add new command for project analysis`
- `Pi: Add ask_user interactive question tool`
- `Setup: Fix symlink creation for nested directories`

## Prerequisites (machine-local, not symlinked)
- **Kotlin LSP**: `brew install JetBrains/utils/kotlin-lsp` — puts `kotlin-lsp` on PATH (the official JetBrains/IntelliJ-based server). Required by `nvim/lua/plugins/kotlin.lua`.

## Important Notes
- Changes to configuration files take effect after running `./setup.sh`
- The setup script removes existing files/symlinks before creating new ones
- Local overrides (like `claude/settings.local.json`) are not tracked in git
- Follow the iterative development approach outlined in `claude/CLAUDE.md` when making changes