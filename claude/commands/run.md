# /run - Structured Task Execution

When executing a task with /run, follow this strict workflow:

## 1. Pre-Task Analysis
- [ ] Break down request into SMALLEST possible atomic tasks
- [ ] Create TodoWrite with pattern:
  - Small chunk 1
  - Test & verify chunk 1
  - Commit chunk 1
  - Small chunk 2
  - Test & verify chunk 2
  - Commit chunk 2
  - ... repeat until complete

## 2. Iterative Execution
For EACH small chunk:
1. Make ONE focused change
2. Run tests - they MUST stay green
3. Commit immediately with descriptive message
4. Move to next chunk only after commit

## 3. Task Completion
- [ ] All tests pass
- [ ] Multiple commits made (one per chunk)
- [ ] Todo list fully completed
- [ ] Summary includes all commit hashes

## Example Todo Structure:
```
1. Add input validation function
2. Test input validation
3. Commit validation changes
4. Update API to use validation
5. Test API changes
6. Commit API updates
7. Add error handling
8. Test error handling
9. Commit error handling
```

## Example Response Format:
```
Breaking down into 3 atomic changes...

Todo List:
1. [First small change]
2. Test first change
3. Commit first change
4. [Second small change]
5. Test second change
6. Commit second change
7. [Third small change]
8. Test third change
9. Commit third change

Starting iterative execution...
[actual work with commits after each chunk]

✓ Task Complete
- Commits made: 
  - abc123: Add validation function
  - def456: Update API endpoints
  - ghi789: Add error handling
- All tests passing
- Todo items: 9/9 completed
```

NEVER make multiple changes before committing!
NEVER leave tests broken between commits!