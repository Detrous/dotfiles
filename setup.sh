#!/bin/bash

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Claude config
rm -f "$HOME/.claude/CLAUDE.md"
rm -f "$HOME/.claude/settings.json"
rm -rf "$HOME/.claude/commands"

ln -s "$DOTFILES_DIR/.claude/CLAUDE.md" "$HOME/.claude/CLAUDE.md"
ln -s "$DOTFILES_DIR/.claude/settings.json" "$HOME/.claude/settings.json"
ln -s "$DOTFILES_DIR/.claude/commands" "$HOME/.claude/commands"

# Zed config
mkdir -p "$HOME/.config/zed"
rm -f "$HOME/.config/zed/keymap.json"
rm -f "$HOME/.config/zed/settings.json"
rm -f "$HOME/.config/zed/tasks.json"

ln -s "$DOTFILES_DIR/.config/zed/keymap.json" "$HOME/.config/zed/keymap.json"
ln -s "$DOTFILES_DIR/.config/zed/settings.json" "$HOME/.config/zed/settings.json"
ln -s "$DOTFILES_DIR/.config/zed/tasks.json" "$HOME/.config/zed/tasks.json"

echo "Claude config linked"
echo "Zed config linked"