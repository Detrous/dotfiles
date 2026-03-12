---
description: Save the approved plan as a self-contained handoff document in docs/plans
---
Write the approved plan from this conversation into a new Markdown file under `docs/plans/`.

If the plan is still ambiguous or not yet approved, do not write the file. Instead, briefly explain what is still missing.

Requirements:
- Choose the filename automatically
- Use this format: `docs/plans/YYYY-MM-DD-topic-plan.md`
- Infer a short descriptive kebab-case topic from the conversation
- If a better suffix fits, you may use `-design`, `-handoff`, or `-implementation-plan`
- Avoid overwriting an existing file; choose a non-conflicting filename

The document must be self-contained for a fresh agent with empty context.

Include:
1. Goal
2. Background / current context
3. Scope
4. Explicit decisions made
5. Constraints and non-goals
6. Relevant file paths
7. API / contract / schema details if relevant
8. Detailed implementation plan broken into small steps
9. Testing / TDD plan
10. Verification commands
11. Risks / open questions
12. Short handoff summary for the next agent

Rules:
- Do not implement code
- Do not omit important decisions already made in this conversation
- Prefer concrete file paths and concrete steps over generic advice
- Keep it practical and execution-ready
- If some detail is still uncertain, call it out explicitly instead of guessing

After writing the file:
- Tell me the exact path
- Give a short bullet summary of what was captured
