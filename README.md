<p align="center">
  <img src="https://img.shields.io/badge/CROW--B3-Local%20Dev%20Kit-black?style=for-the-badge&logo=github" alt="CROW-B3 Local Dev Kit"/>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Bun-1.0+-f472b6?style=flat-square&logo=bun&logoColor=white" alt="Bun"/>
  <img src="https://img.shields.io/badge/TypeScript-5.0+-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square" alt="Platform"/>
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License"/>
</p>

<p align="center">
  <b>One command to clone them all. One command to sync them.</b><br/>
  <sub>Local development helper scripts for the CROW-B3 organization</sub>
</p>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Quick Start](#-quick-start)
- [How It Works](#-how-it-works)
- [Commands](#-commands)
- [Repository Map](#%EF%B8%8F-repository-map)
- [Configuration](#%EF%B8%8F-configuration)
- [Troubleshooting](#-troubleshooting)

---

## 🔮 Overview

Clone this repo once, run one command, and get **ALL 22+ repositories** set up with dependencies installed. Keep everything in sync daily with a single command.

```mermaid
graph LR
    A[📦 Clone local-dev] --> B[🚀 bun run clone]
    B --> C[📁 22 repos cloned]
    C --> D[📦 All deps installed]
    D --> E[✅ Ready to develop!]

    style A fill:#1a1a2e,stroke:#0f3460,color:#fff
    style B fill:#16213e,stroke:#0f3460,color:#fff
    style C fill:#0f3460,stroke:#e94560,color:#fff
    style D fill:#0f3460,stroke:#e94560,color:#fff
    style E fill:#1b4332,stroke:#40916c,color:#fff
```

---

## 🚀 Quick Start

### Prerequisites

| Requirement | Version | Installation |
|-------------|---------|--------------|
| 🥟 **Bun** | v1.0+ | `curl -fsSL https://bun.sh/install \| bash` |
| 🔧 **Git** | Any | [git-scm.com](https://git-scm.com/) |
| 🔑 **GitHub Access** | - | Access to CROW-B3 org (for private repos) |

### Setup in 3 Steps

```bash
# ① Clone this repository
git clone https://github.com/CROW-B3/local-dev.git
cd local-dev

# ② Install dependencies
bun install

# ③ Clone all CROW-B3 repositories
bun run clone
```

**That's it!** All 22 repositories are now cloned with dependencies installed.

---

## 🔄 How It Works

### Initial Setup Flow (One-Time)

```mermaid
sequenceDiagram
    autonumber
    participant You
    participant LocalDev as local-dev
    participant GitHub
    participant Workspace as C:/CROW/*

    You->>GitHub: git clone local-dev
    GitHub-->>LocalDev: Repository cloned
    You->>LocalDev: bun install
    LocalDev-->>LocalDev: Dependencies installed
    You->>LocalDev: bun run clone

    loop For each of 22 repos
        LocalDev->>GitHub: git clone repo
        GitHub-->>Workspace: Repository cloned
        LocalDev->>Workspace: Detect package manager
        LocalDev->>Workspace: Run install (bun/pnpm/yarn/npm)
    end

    LocalDev-->>You: ✅ All 22 repos ready!
```

### Daily Sync Flow (Recurring)

```mermaid
sequenceDiagram
    autonumber
    participant You
    participant LocalDev as local-dev
    participant Repo as Each Repository

    You->>LocalDev: bun run sync

    loop For each repository
        LocalDev->>Repo: Check for uncommitted changes

        alt Has uncommitted changes
            Repo-->>LocalDev: ⚠️ Dirty
            LocalDev-->>LocalDev: SKIP (or stash if --force)
        else Clean
            Repo-->>LocalDev: ✅ Clean
            LocalDev->>Repo: git checkout main
            LocalDev->>Repo: git pull
            LocalDev->>Repo: Detect package manager
            LocalDev->>Repo: Run install
            Repo-->>LocalDev: ✅ Synced
        end
    end

    LocalDev-->>You: ✅ All repos synced!
```

### Sync Decision Logic

```mermaid
flowchart TD
    A[Start Sync] --> B{Repo exists?}
    B -->|No| C[⏭️ Skip - Not cloned]
    B -->|Yes| D{Has uncommitted changes?}

    D -->|Yes| E{--force flag?}
    E -->|No| F[⏭️ Skip - Has changes]
    E -->|Yes| G[📦 Stash changes]
    G --> H

    D -->|No| H[🔄 git fetch]
    H --> I[🌿 git checkout main]
    I --> J[⬇️ git pull]
    J --> K{Has package.json?}

    K -->|No| L[✅ Done]
    K -->|Yes| M[📦 Detect package manager]
    M --> N[📥 Run install]
    N --> L

    style A fill:#1a1a2e,stroke:#0f3460,color:#fff
    style L fill:#1b4332,stroke:#40916c,color:#fff
    style C fill:#854d0e,stroke:#ca8a04,color:#fff
    style F fill:#854d0e,stroke:#ca8a04,color:#fff
```

### Package Manager Detection

```mermaid
flowchart LR
    A[Check Lock Files] --> B{bun.lockb?}
    B -->|Yes| C[🥟 bun install]
    B -->|No| D{pnpm-lock.yaml?}
    D -->|Yes| E[📦 pnpm install]
    D -->|No| F{yarn.lock?}
    F -->|Yes| G[🧶 yarn install]
    F -->|No| H{package-lock.json?}
    H -->|Yes| I[📋 npm install]
    H -->|No| J{package.json exists?}
    J -->|Yes| K[🥟 bun install<br/>default]
    J -->|No| L[⏭️ Skip install]

    style C fill:#f472b6,stroke:#ec4899,color:#000
    style E fill:#f59e0b,stroke:#d97706,color:#000
    style G fill:#2563eb,stroke:#1d4ed8,color:#fff
    style I fill:#dc2626,stroke:#b91c1c,color:#fff
    style K fill:#f472b6,stroke:#ec4899,color:#000
```

---

## 💻 Commands

### Clone Command

```bash
bun run clone [options]
```

| Option | Description |
|--------|-------------|
| _(none)_ | Clone 22 default repositories |
| `--all`, `-a` | Clone ALL repositories (including R&D, templates) |
| `--help`, `-h` | Show help message |

### Sync Command

```bash
bun run sync [options]
```

| Option | Description |
|--------|-------------|
| _(none)_ | Sync repos (skips those with uncommitted changes) |
| `--force`, `-f` | Stash uncommitted changes and sync anyway |
| `--all`, `-a` | Sync ALL repositories |
| `--help`, `-h` | Show help message |

### Quick Reference

| Task | Command |
|------|---------|
| First time setup | `git clone ... && cd local-dev && bun install && bun run clone` |
| Daily sync | `bun run sync` |
| Force sync (stash changes) | `bun run sync --force` |
| Clone including R&D repos | `bun run clone --all` |

---

## 🗺️ Repository Map

### Architecture Overview

```mermaid
graph TB
    subgraph Clients["🖥️ Clients"]
        DC[dashboard-client]
        LC[landing-client]
        AC[auth-client]
        RS[rogue-store]
    end

    subgraph Gateway["🚪 Gateway"]
        AG[core-api-gateway]
    end

    subgraph CoreServices["⚙️ Core Services"]
        AUTH[core-auth-service]
        USER[core-user-service]
        PROD[core-product-service]
        INT[core-interaction-service]
        PAT[core-pattern-service]
        ANA[core-analytics-service]
        NOT[core-notification-service]
        ORG[core-organization-service]
    end

    subgraph Supporting["🔌 Supporting Services"]
        BFF[bff-chat-service]
        MCP[mcp-service]
        A2A[a2a-service]
        WEB[web-ingest-service]
    end

    subgraph SDKs["📚 SDKs & Libs"]
        SDK[website-hook-sdk]
        UI[ui-kit]
    end

    subgraph Infra["🏗️ Infrastructure"]
        K8S[infrastructure]
    end

    Clients --> Gateway
    Gateway --> CoreServices
    Gateway --> Supporting
    Clients -.-> SDKs
    CoreServices --> Infra

    style Gateway fill:#0f3460,stroke:#e94560,color:#fff
    style CoreServices fill:#1a1a2e,stroke:#0f3460,color:#fff
    style Supporting fill:#16213e,stroke:#0f3460,color:#fff
    style Clients fill:#1b4332,stroke:#40916c,color:#fff
    style SDKs fill:#854d0e,stroke:#ca8a04,color:#fff
    style Infra fill:#4a044e,stroke:#a21caf,color:#fff
```

### Repository Breakdown

```mermaid
pie showData
    title Repositories by Category (22 Default)
    "Core Services" : 9
    "Supporting Services" : 4
    "Clients" : 4
    "SDKs & Libraries" : 2
    "Documentation" : 2
    "Infrastructure" : 1
```

### Workspace Structure After Clone

```
C:/CROW/                              ◀── Your workspace root
│
├── 📁 local-dev/                     ◀── You are here
│   ├── 📄 package.json
│   ├── 📄 repos.config.ts
│   └── 📁 src/
│
├── ⚙️ CORE SERVICES (9)
│   ├── core-api-gateway/
│   ├── core-auth-service/
│   ├── core-user-service/
│   ├── core-product-service/
│   ├── core-interaction-service/
│   ├── core-pattern-service/
│   ├── core-analytics-service/
│   ├── core-notification-service/
│   └── core-organization-service/
│
├── 🔌 SUPPORTING (4)
│   ├── bff-chat-service/
│   ├── mcp-service/
│   ├── a2a-service/
│   └── web-ingest-service/
│
├── 🖥️ CLIENTS (4)
│   ├── dashboard-client/
│   ├── landing-client/
│   ├── auth-client/
│   └── rogue-store/
│
├── 📚 SDKs (2)
│   ├── website-hook-sdk/
│   └── ui-kit/
│
├── 📖 DOCS (2)
│   ├── internal-docs/
│   └── public-docs/
│
└── 🏗️ INFRA (1)
    └── infrastructure/
```

### All Repositories Status

```mermaid
graph LR
    subgraph Default["✅ Cloned by Default (22)"]
        CS[9 Core Services]
        SS[4 Supporting]
        CL[4 Clients]
        SD[2 SDKs]
        DO[2 Docs]
        IN[1 Infra]
    end

    subgraph Optional["⚠️ Optional --all (4)"]
        RD[rnd]
        AT[api-tests]
        PP[pattern-poc]
        SF[stitch-figma]
    end

    subgraph Excluded["❌ Excluded (6)"]
        T1[5 Templates]
        GH[.github]
    end

    style Default fill:#1b4332,stroke:#40916c,color:#fff
    style Optional fill:#854d0e,stroke:#ca8a04,color:#fff
    style Excluded fill:#7f1d1d,stroke:#dc2626,color:#fff
```

---

## ⚙️ Configuration

### Adding/Removing Repositories

Edit `repos.config.ts` to customize which repositories are managed:

```typescript
// repos.config.ts
{
  name: "my-new-repo",
  description: "Description of the repo",
  category: "core-service",
  cloneByDefault: true,      // true = cloned with `bun run clone`
                             // false = only with `--all` flag
  isPrivate: true,
}
```

### Category Types

| Category | Description | Count |
|----------|-------------|-------|
| `core-service` | Backend microservices | 9 |
| `supporting-service` | BFF and helper services | 4 |
| `client` | Frontend applications | 4 |
| `sdk` | SDKs and libraries | 2 |
| `docs` | Documentation sites | 2 |
| `infrastructure` | DevOps/K8s configs | 1 |
| `rnd` | Research & development | 4 |
| `template` | Template repositories | 5 |
| `config` | Org configuration | 1 |

---

## 🔧 Troubleshooting

### Decision Tree

```mermaid
flowchart TD
    A[Issue?] --> B{What's the problem?}

    B -->|Auth failed| C[Run: gh auth login<br/>Or configure SSH keys]
    B -->|Permission denied| D[Check CROW-B3 org access<br/>on GitHub]
    B -->|Sync skipping| E{Want to force?}
    E -->|Yes| F[bun run sync --force]
    E -->|No| G[Commit or stash manually]
    B -->|bun not found| H[Install: curl -fsSL<br/>bun.sh/install \| bash]
    B -->|Clone fails| I[Check repo exists:<br/>gh repo view CROW-B3/X]

    style A fill:#7f1d1d,stroke:#dc2626,color:#fff
    style C fill:#1b4332,stroke:#40916c,color:#fff
    style D fill:#1b4332,stroke:#40916c,color:#fff
    style F fill:#1b4332,stroke:#40916c,color:#fff
    style G fill:#1b4332,stroke:#40916c,color:#fff
    style H fill:#1b4332,stroke:#40916c,color:#fff
    style I fill:#1b4332,stroke:#40916c,color:#fff
```

### Common Issues

| Problem | Solution |
|---------|----------|
| Authentication failed | Run `gh auth login` or configure SSH keys |
| Permission denied | Ensure you have access to CROW-B3 organization |
| Sync skipping repos | Repo has uncommitted changes. Use `--force` or commit manually |
| `bun: command not found` | Install Bun: `curl -fsSL bun.sh/install \| bash` |
| Clone fails for repo | Check if repo exists: `gh repo view CROW-B3/repo-name` |

### Getting Help

```bash
bun run clone --help    # Show clone options
bun run sync --help     # Show sync options
```

---

## 📁 Project Structure

```
local-dev/
├── 📄 package.json           # Scripts: clone, sync
├── 📄 repos.config.ts        # All 33 repos configured
├── 📄 tsconfig.json          # TypeScript configuration
├── 📄 .gitignore             # Git ignore patterns
├── 📄 README.md              # This file
└── 📁 src/
    ├── 📄 clone.ts           # Clone all repos to ../
    ├── 📄 sync.ts            # Pull + install for all repos
    └── 📄 utils.ts           # Git helpers, pkg manager detection
```

---

## 🤝 Contributing

1. Make changes to scripts in `src/`
2. Update `repos.config.ts` if adding new repos
3. Run `bunx tsc --noEmit` to check for type errors
4. Test with `bun run clone --help` and `bun run sync --help`
5. Submit a PR

---

<p align="center">
  <sub>Built with 🥟 Bun + TypeScript</sub><br/>
  <sub>MIT License © CROW-B3</sub>
</p>
