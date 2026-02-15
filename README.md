# CROW-B3 Local Dev

Clone and sync all CROW-B3 repositories with a single command.

## Prerequisites

- [Bun](https://bun.sh) v1.0+
- [Git](https://git-scm.com)
- GitHub access to CROW-B3 organization

## Setup

```bash
# Clone this repo
git clone https://github.com/CROW-B3/local-dev.git
cd local-dev

# Install dependencies
bun install

# Clone all repositories
bun run clone
```

All 22 default repositories will be cloned to the parent directory with dependencies installed.

## Commands

### Clone

```bash
bun run clone              # Clone default repos (22)
bun run clone --all        # Clone all repos including optional (30)
bun run clone --only NAME  # Clone specific repo
bun run clone --dry-run    # Preview without cloning
bun run clone --help       # Show help
```

### Sync

```bash
bun run sync              # Sync all repos (skip dirty)
bun run sync --force      # Stash changes and sync
bun run sync --only NAME  # Sync specific repo
bun run sync --dry-run    # Preview without syncing
bun run sync --help       # Show help
```

### Cleanup

⚠️ **DESTRUCTIVE** - Deletes all Cloudflare resources for an environment

```bash
bun run cleanup:dev       # Clean dev environment (crow-*-dev)
bun run cleanup:prod      # Clean prod environment (crow-*)
```

**What gets deleted:**
- D1 databases
- R2 buckets
- KV namespaces
- Queues

**Safety features:**
- Pattern matching (dev: `crow-*-dev`, prod: `crow-*` excluding `-dev`)
- Confirmation prompts for each resource type
- Detailed listing before deletion
- Summary report

## Workspace Structure

```
~/workspace/
├── local-dev/          <- You are here
├── core-api-gateway/
├── core-auth-service/
├── dashboard-client/
└── ... (other repos)
```

## Configuration

Edit `repos.config.ts` to add or remove repositories.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Auth failed | Run `gh auth login` or configure SSH keys |
| Permission denied | Check CROW-B3 org access |
| Sync skipping repos | Has uncommitted changes, use `--force` |
| Clone fails | Check if repo exists: `gh repo view CROW-B3/name` |
