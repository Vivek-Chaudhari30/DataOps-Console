# DataOps Console

A dashboard for monitoring **dataset-generation projects** — the kind a data
vendor runs for a frontier AI lab. It tracks throughput, quality, annotator
performance and timeline burndown across several concurrent projects, and uses
Claude to produce daily status digests and to flag projects that are trending
at-risk.

> Status: **Milestone 1 complete** — data model + synthetic seed. Metrics,
> dashboard UI and AI features land in subsequent milestones.

## What it simulates

Several dataset-generation projects running in parallel, each with a contracted
item target and deadline, staffed by annotators of varying speed and quality.
The seed produces ~6 weeks of history with a deliberate mix:

- **Healthy projects** — steady throughput, stable/rising quality, on pace.
- **At-risk projects** — throughput decaying toward the deadline, quality
  slipping week over week, behind the burndown target.
- **Strong vs. noisy annotators** — so the leaderboard and quality trends have
  real spread.

This gives the charts real shape and gives the AI risk-flagging something
genuine to detect.

## Stack

- **Next.js (App Router) + React + TypeScript**
- **Postgres + Prisma 7** (driver adapter `@prisma/adapter-pg`)
- **Recharts** for charts
- **Anthropic Messages API** for the AI features (model + key from env)
- Local Postgres via **Docker Compose**; deploys to **Vercel + Neon**

## Data model

| Model | Purpose |
|-------|---------|
| `Project` | A dataset-generation engagement: domain, contracted target, start date, deadline, status. |
| `Annotator` | A person producing items; has a speciality. |
| `Item` | A single produced item: status (`PENDING`/`IN_REVIEW`/`APPROVED`/`REJECTED`), quality score `[0,1]`, produced/reviewed timestamps. |
| `Milestone` | A target checkpoint for a project, used for burndown-vs-target lines. |

See [`prisma/schema.prisma`](prisma/schema.prisma).

## Getting started

Prerequisites: Node 20+, pnpm, Docker.

```bash
pnpm install
cp .env.example .env          # local defaults already point at the Docker DB

pnpm db:up                    # start Postgres (docker-compose)
pnpm db:migrate               # apply migrations + generate the Prisma client
pnpm db:seed                  # load ~6 weeks of synthetic data
pnpm db:summary               # read-back: prove the data has real shape
```

`pnpm db:summary` prints, per project, weekly throughput, approval rate and
average quality over time, plus delivery-vs-target pace — a quick way to verify
the seed before any UI exists.

### Useful scripts

| Script | Description |
|--------|-------------|
| `pnpm db:up` / `pnpm db:down` | Start / stop the local Postgres container. |
| `pnpm db:migrate` | Apply migrations and regenerate the Prisma client. |
| `pnpm db:reset` | Drop and recreate the database, then re-run migrations. |
| `pnpm db:seed` | Reset tables and load synthetic data (deterministic seed). |
| `pnpm db:summary` | Print a read-back summary of the seeded data. |
| `pnpm db:studio` | Open Prisma Studio. |

The seed is **deterministic** (fixed RNG seed), so every run produces the same
dataset — convenient for screenshots and for reasoning about the AI outputs.

## Environment variables

| Variable | Used for |
|----------|----------|
| `DATABASE_URL` | Postgres connection string. |
| `ANTHROPIC_API_KEY` | Anthropic Messages API (AI features, milestone 4). |
| `ANTHROPIC_MODEL` | Claude model id, e.g. `claude-sonnet-4-6`. |
