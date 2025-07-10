#!/bin/bash

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Remove existing files and create symlinks
rm -f "$HOME/.claude/CLAUDE.md"
rm -f "$HOME/.claude/settings.json"

ln -s "$DOTFILES_DIR/.claude/CLAUDE.md" "$HOME/.claude/CLAUDE.md"
ln -s "$DOTFILES_DIR/.claude/settings.json" "$HOME/.claude/settings.json"

echo "Claude config linked"