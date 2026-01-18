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
bun run clone              # Clone default repos
bun run clone --all        # Include optional repos
bun run clone --only NAME  # Clone specific repo
```

### Sync

```bash
bun run sync              # Sync all repos (skip dirty)
bun run sync --force      # Stash changes and sync
bun run sync --parallel   # Sync in parallel (3 concurrent)
bun run sync --only NAME  # Sync specific repo
```

### Clean

```bash
bun run clean             # Interactive D1/R2 cleanup
```

Requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` for R2 operations.

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
| R2 cleanup fails | Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` |
