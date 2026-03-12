# gh Command Reference

## Pull Requests

```bash
gh pr list --repo owner/repo
gh pr list --repo owner/repo --state open
gh pr view 123 --repo owner/repo
gh pr view 123 --repo owner/repo --json number,title,body,state,author,labels,reviews
gh pr checks 123 --repo owner/repo
gh pr diff 123 --repo owner/repo
```

## Issues

```bash
gh issue list --repo owner/repo
gh issue list --repo owner/repo --state open --label bug
gh issue view 456 --repo owner/repo
gh issue view 456 --repo owner/repo --json number,title,body,state,author,labels,comments
```

## Workflow Runs

```bash
gh run list --repo owner/repo
gh run list --repo owner/repo --workflow ci.yml --limit 10
gh run view <run-id> --repo owner/repo
gh run view <run-id> --repo owner/repo --log
gh run view <run-id> --repo owner/repo --log-failed
```

## Releases

```bash
gh release list --repo owner/repo
gh release view --repo owner/repo
gh release view v1.2.3 --repo owner/repo
gh release view v1.2.3 --repo owner/repo --json tagName,name,body,assets,publishedAt
```

## Repository

```bash
gh repo view owner/repo
gh repo view owner/repo --json name,description,defaultBranchRef,stargazerCount,forkCount
```

## Commits

```bash
gh api repos/owner/repo/commits --jq '.[].commit.message' | head -20
gh api repos/owner/repo/commits/SHA
```

## Generic API

```bash
gh api repos/owner/repo
gh api repos/owner/repo/branches
gh api repos/owner/repo/actions/workflows
gh api /rate_limit
```

## Structured Output Tips

```bash
# JSON with field selection
gh pr list --repo owner/repo --json number,title,state

# JSON + jq filter inline
gh run list --repo owner/repo --json databaseId,status,conclusion --jq '.[] | select(.conclusion == "failure")'

# Paginate gh api
gh api repos/owner/repo/issues --paginate --jq '.[].title'
```
