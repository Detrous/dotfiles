#!/usr/bin/env python3
import json
import sys
from pathlib import Path

THREE_DOTS_CONTEXT = """
🛑 The "..." Signal

When you see "...", it means stop and reassess - you've missed something important. This isn't a reprimand, it's a course correction from a teammate.

When you see it:
1. Stop what you're doing
2. Re-read the original request
3. Check the guidelines below for missed steps
4. Identify what went wrong
5. Correct course

⚠️  COMMON MISTAKE: Jumping into code without proper planning by guidelines!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

def load_claude_md():
    claude_md_path = Path.home() / '.claude' / 'CLAUDE.md'
    with open(claude_md_path, 'r') as f:
        claude_md_content = f.read()

    return f"📚 Global guidelines from {claude_md_path}:\n\n{claude_md_content}"

try:
    input_data = json.load(sys.stdin)
    prompt = input_data.get("prompt", "").strip()

    if "..." in prompt:
        print(THREE_DOTS_CONTEXT)

    if "..." in prompt or '--load-claude-md' in prompt:
        print(load_claude_md())

    sys.exit(0)

except Exception as e:
    print(f"Error in user prompt hook: {e}", file=sys.stderr)
    sys.exit(1)
