# Research Command

Execute comprehensive, multi-perspective research following a strict protocol.

## Usage
```
/research [topic]
```

## Topic
$ARGUMENTS

## MANDATORY EXECUTION SEQUENCE

### STEP 1: Ask Clarifying Questions (REQUIRED)
STOP and ask 2-3 specific questions to understand:
- What specific aspect of the topic matters most?
- What decisions will this research inform?
- Are there particular concerns or constraints?

WAIT for user response before proceeding.

### STEP 2: Use Sequential Thinking to Plan (REQUIRED)
Use mcp__sequential-thinking__sequentialthinking to:
- Break down the research problem
- Identify key angles to investigate
- Plan the research approach
- Define success criteria

### STEP 3: Launch Parallel Investigation (REQUIRED)
Based on your plan, launch ALL relevant Task agents IN A SINGLE MESSAGE:

```
Task 1: "Research performance benchmarks and technical analysis of [specific aspect]"
Task 2: "Find real-world case studies and developer experiences with [specific aspect]"
Task 3: "Investigate best practices and common pitfalls for [specific aspect]"
Task 4: "Research alternative approaches and trade-offs for [specific aspect]"
```

Add more agents as needed based on the topic complexity.

### STEP 4: Synthesize with Critical Thinking (REQUIRED)
After agents report:
- Use sequential thinking to analyze findings
- Map contradictions and understand why they exist
- Identify knowledge gaps
- Challenge mainstream assumptions
- Extract actionable insights

### STEP 5: Document Comprehensive Results (REQUIRED)
Save to Basic Memory: `{project}/research/{Topic}.md`

Include:
- **Context**: Original questions and scope
- **Executive Summary**: 3-5 key findings
- **Detailed Analysis**: All perspectives with evidence
- **Contradictions**: Conflicts and their implications
- **Unknowns**: What we couldn't determine and why
- **Recommendations**: Specific, actionable guidance

## ENFORCEMENT RULES

YOU MUST:
1. ALWAYS ask questions first - no exceptions
2. ALWAYS use sequential thinking for planning
3. ALWAYS launch multiple agents in parallel
4. ALWAYS synthesize with sequential thinking
5. ALWAYS save comprehensive results

FAILURE TO FOLLOW ALL STEPS = FAILED RESEARCH