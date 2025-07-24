# Sync Latest Settings Changes

Check if there's a local `.claude/settings.local.json` file in the current directory. If it exists and has permissions that differ from the global `~/.claude/settings.json`:

1. Identify the new permissions added to the local settings
2. Remove those permissions from the local settings.json
3. Add them to the global settings.json
4. Show what was moved

This helps keep the global settings up-to-date with permissions you've approved during your work sessions.

**Important**: This only moves NEW permissions that exist in local but not in global. It doesn't sync the entire file or remove permissions from global.
