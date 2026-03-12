# Release Flow

## Branch Strategy

- `main`: daily development branch.
- `release`: deployment branch. Pushing to this branch triggers production deployment.

## Standard Workflow

1. Develop on `main`.
2. Commit and push to `main`.
3. When ready to deploy, merge `main` into `release`.
4. Push `release` to trigger GitHub Actions auto deploy.

## Commands

```bash
cd /Users/allen/Workspace/sail/harbor

# Sync main
git checkout main
git pull origin main

# Release
git checkout release
git pull origin release
git merge --no-ff main -m "chore(release): merge main for deployment"
git push origin release

# Back to dev
git checkout main
```

## Deployment Trigger

- Workflow: `.github/workflows/deploy-release.yml`
- Trigger: `push` on branch `release`
- Output path on server: `/var/www/sail/releases/<run-id>-<sha>`
- Active symlink: `/var/www/sail/current`
