#!/bin/bash

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Claude config
rm -f "$HOME/.claude/CLAUDE.md"
rm -f "$HOME/.claude/settings.json"
rm -rf "$HOME/.claude/commands"
rm -rf "$HOME/.claude/hooks"

ln -s "$DOTFILES_DIR/claude/CLAUDE.md" "$HOME/.claude/CLAUDE.md"
ln -s "$DOTFILES_DIR/claude/settings.json" "$HOME/.claude/settings.json"
ln -s "$DOTFILES_DIR/claude/commands" "$HOME/.claude/commands"
ln -s "$DOTFILES_DIR/claude/hooks" "$HOME/.claude/hooks"

# Zed config
mkdir -p "$HOME/.config/zed"
rm -f "$HOME/.config/zed/keymap.json"
rm -f "$HOME/.config/zed/settings.json"
rm -f "$HOME/.config/zed/tasks.json"

ln -s "$DOTFILES_DIR/zed/config/keymap.json" "$HOME/.config/zed/keymap.json"
ln -s "$DOTFILES_DIR/zed/config/settings.json" "$HOME/.config/zed/settings.json"
ln -s "$DOTFILES_DIR/zed/config/tasks.json" "$HOME/.config/zed/tasks.json"

# Zsh config
rm -f "$HOME/.zshrc"
rm -f "$HOME/.zprofile"

ln -s "$DOTFILES_DIR/zsh/.zshrc" "$HOME/.zshrc"
ln -s "$DOTFILES_DIR/zsh/.zprofile" "$HOME/.zprofile"

# Pi agent extensions, skills, and global context (dotfiles is source of truth)
mkdir -p "$HOME/.pi/agent"
rm -rf "$HOME/.pi/agent/extensions"
rm -rf "$HOME/.pi/agent/skills"
rm -f "$HOME/.pi/agent/AGENTS.md"
ln -s "$DOTFILES_DIR/pi/extensions" "$HOME/.pi/agent/extensions"
ln -s "$DOTFILES_DIR/pi/skills" "$HOME/.pi/agent/skills"
ln -s "$DOTFILES_DIR/pi/AGENTS.md" "$HOME/.pi/agent/AGENTS.md"

echo "Claude config linked"
echo "Zed config linked"
echo "Zsh config linked"
echo "Pi extensions linked"
echo "Pi skills linked"
echo "Pi AGENTS.md linked"