# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview
This is a personal dotfiles repository for managing configuration files across development tools. It uses symlinks to connect versioned configurations to their expected locations in the home directory.

## Setup and Installation
- **Main setup command**: `./setup.sh` - Creates symlinks for all configuration files
  - Removes existing symlinks/files before creating new ones
  - Links Claude configuration from `claude/` to `~/.claude/`
  - Links Zed editor configuration from `zed/config/` to `~/.config/zed/`
  - Links Pi extensions directory from `pi/extensions/` to `~/.pi/agent/extensions/` (dotfiles is source of truth)
  - Links Pi skills directory from `pi/skills/` to `~/.pi/agent/skills/` (dotfiles is source of truth)
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
│   └── hooks/        # Pre/post action hooks
│       └── pre-user-prompt-submit.py  # Hook executed before user prompts
├── pi/               # Pi coding agent configuration
│   ├── AGENTS.md     # Global agent guidelines (symlinked to ~/.pi/agent/AGENTS.md)
│   ├── extensions/   # TypeScript extensions (symlinked to ~/.pi/agent/extensions/)
│   │   └── ask-user.ts  # Interactive TUI question tool for the LLM
│   └── skills/       # Pi skills (symlinked to ~/.pi/agent/skills/)
│       └── github-fetch/  # Use gh CLI to read GitHub repos, PRs, issues, runs, releases
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

## Development Workflow
1. Edit configuration files in this repository
2. Run `./setup.sh` to update symlinks
3. Commit changes following the guidelines in `claude/CLAUDE.md`

## Commit Message Conventions
Use prefixes to indicate which component is being modified:
- `Zed:` - Changes to Zed editor configuration or plugins
- `Claude:` - Changes to Claude configuration, commands, or hooks
- `Pi:` - Changes to Pi agent extensions or configuration
- `Setup:` - Changes to setup scripts or installation process
- `Docs:` - Documentation updates

Examples:
- `Zed: Enable claude-code-server for Kotlin files`
- `Claude: Add new command for project analysis`
- `Pi: Add ask_user interactive question tool`
- `Setup: Fix symlink creation for nested directories`

## Important Notes
- Changes to configuration files take effect after running `./setup.sh`
- The setup script removes existing files/symlinks before creating new ones
- Local overrides (like `claude/settings.local.json`) are not tracked in git
- Follow the iterative development approach outlined in `claude/CLAUDE.md` when making changes