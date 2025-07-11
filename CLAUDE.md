# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview
This is a personal dotfiles repository for managing configuration files across development tools. It uses symlinks to connect versioned configurations to their expected locations in the home directory.

## Setup and Installation
- **Main setup command**: `./setup.sh` - Creates symlinks for all configuration files
  - Removes existing symlinks/files before creating new ones
  - Links Claude configuration from `.claude/` to `~/.claude/`
  - Links Zed editor configuration from `.config/zed/` to `~/.config/zed/`

## Repository Structure
```
dotfiles/
├── .claude/          # Claude AI configuration
│   ├── CLAUDE.md     # Global coding guidelines (symlinked to ~/.claude/)
│   ├── settings.json # Claude permissions and allowed commands
│   └── commands/     # Custom Claude commands
│       ├── learn.md          # Session summary command template
│       ├── sync-settings.md  # Sync local permissions to global settings
│       └── update-claude-md.md  # Update project CLAUDE.md files
├── .config/          # Application configurations
│   └── zed/          # Zed editor settings
│       ├── keymap.json
│       ├── settings.json
│       └── tasks.json
└── setup.sh          # Setup script for creating symlinks
```

## Development Workflow
1. Edit configuration files in this repository
2. Run `./setup.sh` to update symlinks
3. Commit changes following the guidelines in `.claude/CLAUDE.md`

## Important Notes
- Changes to configuration files take effect after running `./setup.sh`
- The setup script removes existing files/symlinks before creating new ones
- Local overrides (like `.claude/settings.local.json`) are not tracked in git
- Follow the iterative development approach outlined in `.claude/CLAUDE.md` when making changes