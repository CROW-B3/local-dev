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

### Checkout

```bash
bun run checkout CROW-156           # Checkout branch by keyword across all repos
bun run checkout CROW-156 --start   # Checkout and start dev servers
bun run checkout CROW-156 --only NAME # Checkout specific repo
```

**Features:**
- Keyword matching: finds branches containing the keyword (case-insensitive)
- Auto-checkout: if only one branch matches, checks out automatically
- Smart selection: if multiple matches, prompts user with PR indicators
- Auto-install: with `--start`, installs dependencies and linked packages before starting servers
- Clean logs: dev server output prefixed with repo names for clarity

### Clean

```bash
bun run clean             # Interactive D1/R2 cleanup
```

Requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` for R2 operations.

### Shutdown / Startup (kill-switch for Cloudflare spend)

These two commands work together. `shutdown` strips every service's
`wrangler.jsonc` down to a stub (no bindings, no cron triggers, no queues, no
AI, no D1/R2/KV/Vectorize, no routes/vars/DOs/containers/env) so that any
subsequent `wrangler deploy` produces a worker that consumes nothing. The
original config for every service is saved to `startup.manifest.json` so
`startup` can later restore everything (and recreate the cloud resources via
the wrangler CLI).

**Important:** `shutdown` modifies only files in this workspace. It does
**not** delete anything from your Cloudflare account.

```bash
bun run shutdown:dry      # preview what would be stripped — no writes
bun run shutdown          # extract manifest + strip every wrangler.jsonc
                          # (refuses if startup.manifest.json already exists;
                          #  pass --force to override)

bun run startup           # DRY RUN — prints the wrangler commands it would run
bun run startup:execute   # actually create D1/R2/KV/Queues/Vectorize and
                          # restore each wrangler.jsonc from the manifest
                          # (new D1/KV ids are captured and substituted)
```

Useful flags on `startup`:

- `--only=<service>` — process just one service
- `--kinds=d1,r2,kv,queues,vectorize` — limit which resource kinds to create
- `--restore-only` — skip all wrangler calls; only restore wrangler.jsonc files

After `startup:execute` you still need to: `wrangler deploy` each service,
re-run drizzle migrations, and re-set any `wrangler secret` values.

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
| Checkout finds no branch | Branch doesn't exist on remote, check spelling |
| Dev servers don't start | Ensure dependencies installed, use `bun install` |
| Port already in use | Another process using port, check with `lsof -i :PORT` |
| R2 cleanup fails | Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` |
