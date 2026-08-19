# NextJSeCommerce — Medusa v2 + Next.js on a single 4GB VPS

A self-contained commerce stack that builds and runs entirely on one Linux VPS
with `docker compose up -d --build`. No CI/CD, no registry, no runner agents.

```
                      ┌──────────── Caddy :80/:443 ────────────┐
                      │  auto TLS (Let's Encrypt HTTP-01)      │
                      └───┬──────────────────────────┬─────────┘
        example.com       │                          │   api.example.com
        www → 301 apex    ▼                          ▼   (+ /app Admin)
                  storefront:3000  ──internal DNS──▶ backend:9000
                   (Next.js SSR)                    (Medusa v2, shared worker)
                                                      │        │
                                              postgres:5432  redis:6379
```

| Container | Memory limit | CPUs | Typical idle |
|---|---:|---:|---:|
| postgres (16-alpine) | 512M | 0.75 | ~120M |
| redis (7-alpine) | 192M | 0.25 | ~15M |
| backend (Medusa v2) | 1024M | 1.50 | ~450M |
| storefront (Next.js standalone) | 512M | 1.00 | ~180M |
| caddy (2-alpine) | 64M | 0.25 | ~20M |
| **Total** | **~2.30G** | | **~0.8–1.6G** |

Postgres and Redis are never published to the host — only Caddy binds ports.

---

## What is in this repository

This repo contains **only the deployment layer**. The application code comes
from the official Medusa starters, cloned on the server by `bootstrap.sh` and
merged *underneath* these overrides:

| File | Purpose |
|---|---|
| [docker-compose.yml](docker-compose.yml) | Five-service orchestration, resource caps, healthchecks |
| [docker-compose.local.yml](docker-compose.local.yml) | Development overlay: published ports, no Caddy |
| [Caddyfile](Caddyfile) | Reverse proxy + automatic TLS |
| [.env.example](.env.example) | Every tunable, documented |
| [medusa/Dockerfile](medusa/Dockerfile) | 3-stage build → `.medusa/server` runtime |
| [medusa/docker-entrypoint.sh](medusa/docker-entrypoint.sh) | Migrations before the server binds |
| [medusa/medusa-config.ts](medusa/medusa-config.ts) | Redis modules, file storage, notifications |
| [medusa/src/modules/smtp-notification/](medusa/src/modules/smtp-notification/) | Gmail SMTP provider (nodemailer) |
| [medusa/src/subscribers/order-placed.ts](medusa/src/subscribers/order-placed.ts) | Triggers the order confirmation email |
| [storefront/Dockerfile](storefront/Dockerfile) | 3-stage build, `output: standalone` |
| [storefront/next.config.mjs](storefront/next.config.mjs) | Standalone output, image hosts, env guard |
| [storefront/src/lib/config.ts](storefront/src/lib/config.ts) | Internal DNS server-side / public URL browser-side |
| [scripts/](scripts/) | bootstrap, backup, restore, publishable-key helper |

---

## The one thing that will bite you

**`NEXT_PUBLIC_*` variables are compiled into the JavaScript bundle at build
time.** The storefront's publishable API key does not exist until the backend
has been seeded. So the order is not negotiable:

> backend up → seed → read key → *then* build the storefront

Building everything in one shot on a cold box produces a storefront that
compiles fine and 401s on every request. Step 6 below exists for this reason,
and [storefront/next.config.mjs](storefront/next.config.mjs) fails the build
loudly rather than letting it happen silently.

---

## Running locally

Works on Windows, macOS and Linux. All you need is Docker Desktop (or Docker
Engine) running — no Node toolchain on the host, because every build happens
inside a container.

**On Windows, run these from Git Bash, not PowerShell** — the scripts are
`bash`, and `docker-compose.local.yml` is what publishes the ports you need.

```bash
cd /c/Users/jayanthyp/OneDrive/Documents/NextJSeCommerce

# 1. Clone the starters and write a localhost .env (no swap, no prompts)
./scripts/bootstrap.sh --local

# 2. Every command below needs BOTH compose files. Save the typing:
alias dc='docker compose -f docker-compose.yml -f docker-compose.local.yml'

# 3. Data layer + backend. First run pulls images and builds Medusa (~5-10 min).
dc up -d --build postgres redis backend
dc logs -f backend        # wait for "[entrypoint] migrations complete"

# 4. Seed, create an admin login, capture the publishable key
dc exec backend ls src/scripts                              # confirm seed.js
dc exec backend npx medusa exec ./src/scripts/seed.js
dc exec backend npx medusa user -e admin@local.test -p supersecret
./scripts/get-publishable-key.sh --write

# 5. NOW build the storefront — step 4 is what makes this possible
dc up -d --build storefront

dc ps                     # all four healthy
```

Then open:

| | |
|---|---|
| Storefront | <http://localhost:3000> |
| Admin | <http://localhost:9000/app> — `admin@local.test` / `supersecret` |
| Store API | <http://localhost:9000/store/products> (needs the publishable key header) |
| Postgres | `localhost:5432` — user/db `medusa`, password in `.env` |

The same ordering constraint applies locally as in production: the storefront
build fails by design if the publishable key is missing, because that key is
compiled into its JavaScript bundle.

Emails are not sent locally unless you fill in `SMTP_USER`/`SMTP_PASS` — Medusa
falls back to the local notification provider, so order confirmations appear in
`dc logs backend` instead of an inbox. That is usually what you want in dev.

### Local day-to-day

```bash
dc logs -f backend storefront
dc restart backend
dc down                      # stop everything, keep the database
dc down -v                   # ALSO wipe the database — you will need to re-seed

# after changing Medusa source
dc up -d --build backend

# after changing storefront source
dc up -d --build storefront
```

### Hot reload

The containers run production builds, so every code change needs a rebuild.
For real feature work you want the dev servers instead — keep Postgres and
Redis in Docker and run the apps on the host:

```bash
dc up -d postgres redis

cd medusa     && npm install && npx medusa develop   # :9000, hot reload
cd storefront && npm install && npm run dev          # :3000, fast refresh
```

Two adjustments are needed for that:

- **Node 20+ is required.** This machine has Node 18.14, which Medusa v2 will
  reject. The containerised path above sidesteps this; native dev does not.
- In `medusa/.env`, point `DATABASE_URL` at `localhost:5432` rather than
  `postgres:5432` — the host is outside the Docker network.

### Testing the Caddy layer locally

Caddy is parked behind a profile because there are no public domains to get
certificates for. To exercise the reverse proxy anyway, set
`CADDY_LOCAL_CERTS=local_certs` in `.env`, add `127.0.0.1 example.com
api.example.com` to `C:\Windows\System32\drivers\etc\hosts`, and start it with
`dc --profile proxy up -d caddy`. Expect a browser trust warning — the
certificate comes from Caddy's internal CA.

### End-to-end order journey test

[storefront/tests/e2e/](storefront/tests/e2e/) has a Playwright suite that
drives a real browser through the whole purchase flow — product page, cart,
checkout, payment, order confirmation — against the stack you just started.
Requires Node 20+ (same floor as native backend dev, above) and Chromium
browsers Playwright manages itself:

```bash
cd storefront
npm install && npx playwright install chromium
npm run test:e2e:ui   # interactive UI mode, or test:e2e for plain CLI
```

Full setup, VS Code integration (the official Playwright Test extension
auto-discovers it), and troubleshooting:
[storefront/tests/e2e/README.md](storefront/tests/e2e/README.md).

---

## Deploying to the VPS

### 0. Point DNS at the VPS first

Three A records, all to the server's public IP:

```
example.com          A   203.0.113.10
www.example.com      A   203.0.113.10
api.example.com      A   203.0.113.10
```

Caddy's HTTP-01 challenge needs these resolving **before** it starts, and needs
ports 80/443 reachable. Verify from the server:

```bash
dig +short example.com www.example.com api.example.com
```

If you want to try the stack before DNS is ready, set
`CADDY_LOCAL_CERTS=local_certs` in `.env` to use self-signed certificates
instead of spending Let's Encrypt's duplicate-certificate quota (5 per week).

### 1. Install Docker on the VPS

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER" && newgrp docker
docker compose version          # must print v2.x
```

### 2. Get this repository onto the server

```bash
sudo mkdir -p /opt && cd /opt
git clone <your-repo-url> NextJSeCommerce
cd NextJSeCommerce
chmod +x scripts/*.sh
```

### 3. Bootstrap: swap, template clones, secrets

```bash
sudo ./scripts/bootstrap.sh \
  --domain example.com \
  --api    api.example.com \
  --email  you@example.com
```

This provisions a 4GB swapfile, clones
[medusa-starter-default](https://github.com/medusajs/medusa-starter-default)
and [nextjs-starter-medusa](https://github.com/medusajs/nextjs-starter-medusa)
into `.templates/`, merges them under the overrides above (`cp -n`, so nothing
in this repo is clobbered), adds the two dependencies the starters are missing
for this deployment (`nodemailer` for SMTP, `sharp` for Next.js image
optimization in standalone mode), refreshes both lockfiles, and writes `.env`
with `openssl`-generated secrets.

Swap matters here: the stack *idles* around 1.5GB, but bundling the Medusa
Admin and compiling Next.js both spike well past that. Swap is insurance
against an OOM kill mid-build, not something the running stack should touch.

### 4. Configure email (optional, do it now)

Edit `.env`:

```bash
SMTP_USER=you@gmail.com
SMTP_PASS=abcd efgh ijkl mnop     # 16-char Google App Password, spaces optional
SMTP_FROM="Example Store <you@gmail.com>"
```

Generate the App Password at **Google Account → Security → 2-Step Verification
→ App passwords** (2FA must be on; regular account passwords stopped working
for SMTP in 2022).

Gmail limits worth knowing before you rely on it: ~500 recipients/day, and
Google rewrites the `From` header to `SMTP_USER`, so mail cannot appear to come
from `orders@example.com`. Leave `SMTP_USER` empty and Medusa falls back to the
local provider, which logs notifications instead of sending them — the store
works either way. Everything is env-driven, so swapping to Resend/Mailgun/SES
later is a `.env` edit.

### 5. Bring up the data layer and backend

```bash
docker compose up -d --build postgres redis backend
docker compose logs -f backend
```

Wait for `[entrypoint] migrations complete` followed by the server listening on
9000. Migrations run automatically from the entrypoint on every boot — they are
idempotent, and in v2 `db:migrate` also syncs module links.

### 6. Seed, create an admin user, capture the publishable key

```bash
# Confirm the compiled seed path — the built server ships JS, not TS.
docker compose exec backend ls src/scripts

docker compose exec backend npx medusa exec ./src/scripts/seed.js

docker compose exec backend npx medusa user \
  -e admin@example.com -p 'a-long-random-password'

# Read the key out of Postgres and write it into .env in one go.
./scripts/get-publishable-key.sh --write
```

The seed creates a default region, sales channel, stock location, shipping
options, and a handful of demo products, so the storefront has something to
render immediately.

### 7. Build the storefront and start the proxy

```bash
docker compose up -d --build storefront caddy
docker compose ps
```

All five containers should report `healthy`. Caddy obtains certificates on
first request; the first `https://` hit may take a few seconds.

### 8. Schedule backups

```bash
crontab -e
# 0 3 * * * /opt/NextJSeCommerce/scripts/backup.sh >> /var/log/medusa-backup.log 2>&1
```

Dumps land gzipped in `backups/` with 7-day rotation. Restore with
`./scripts/restore.sh backups/<file>.sql.gz`.

---

## Day-two operations

```bash
# Full redeploy after a code change
docker compose up -d --build

# Storefront only, after changing any NEXT_PUBLIC_* value
docker compose build --no-cache storefront && docker compose up -d storefront

# Logs
docker compose logs -f backend
docker compose logs -f caddy

# Live resource usage against the caps
docker stats --no-stream

# Open a Medusa CLI session
docker compose exec backend npx medusa --help

# psql
docker compose exec postgres psql -U medusa -d medusa
```

`docker compose down` is safe. **`docker compose down -v` is not** — it deletes
the `caddy_data` volume along with your certificates and the `pgdata` volume
along with your store.

---

## Verification checklist

```bash
# 1. memory ceiling — sum of MEM USAGE must sit under 2.5G, swap near zero
docker stats --no-stream
free -h

# 2. health gating — all five healthy, backend log shows migrations not retries
docker compose ps
docker compose logs backend | head -30

# 3. TLS and routing
curl -sI https://example.com          | head -1     # 200
curl -sI https://www.example.com      | head -1     # 301 -> apex
curl -s  https://api.example.com/health              # OK

# 4. internal DNS bridge (server-side traffic never leaves the network)
docker compose exec storefront wget -qO- http://backend:9000/health

# 5. store API accepts the publishable key
curl -s -H "x-publishable-api-key: $(./scripts/get-publishable-key.sh)" \
  https://api.example.com/store/products | head -c 400

# 6. restart resilience — carts and workflows are Redis-backed
docker compose restart backend

# 7. backup round-trip
./scripts/backup.sh && ls -lh backups/
```

Then in a browser:

- `https://api.example.com/app` — Admin loads, step-6 credentials log in.
- `https://example.com` — redirects to `/us`, seeded products render (images
  loading proves the file provider's `backend_url` is right), add to cart,
  check out with the **manual** payment provider, order appears in Admin.
- The order confirmation email arrives (or shows in
  `docker compose logs backend` if SMTP is unset). A wrong App Password
  surfaces as `535-5.7.8`.

---

## Design notes

**Why `noeviction` on Redis.** It backs the cache *and* the event bus (BullMQ)
*and* the workflow engine. Two of those three store job and workflow state, not
disposable cache — an LRU policy would silently evict in-flight jobs under
pressure. A loud write error is the better failure mode.

**Why a single Medusa process.** `MEDUSA_WORKER_MODE=shared` runs the Store
API, Admin API and background jobs together. Splitting into server + worker
containers is the right call at scale, but roughly doubles Medusa's footprint —
which this host cannot afford. Redis is already configured for the split, so
promoting a worker later is a compose change, not a rewrite.

**Why `.medusa/server` and not `dist/`.** `medusa build` emits a
self-contained server package with its own `package.json`, which needs its own
production install. That directory is what ships; the source tree does not.

**Payments.** Only the built-in manual/system provider is enabled — checkout
completes without capturing money. Enable it per-region in Admin → Settings →
Regions. Adding Stripe later means registering `@medusajs/payment-stripe` in
[medusa/medusa-config.ts](medusa/medusa-config.ts) and rebuilding.

**Image optimization is tuned down, not off.** `sharp` allocates in proportion
to source image dimensions, and inside the storefront's 512M cap it is the most
likely OOM trigger. [next.config.mjs](storefront/next.config.mjs) therefore
narrows the surface: four breakpoints instead of eight, webp only (avif costs
several times the CPU and memory), and a 30-day cache TTL so each variant is
produced once. If you pre-size your product images, swapping the whole `images`
block for `unoptimized: true` removes sharp from the runtime entirely.

**File storage.** Uploads go to the `medusa_uploads` volume via the File Local
provider and are served from `https://api.example.com/static`. This ties images
to this VPS — `backup.sh` has a commented block for including them in the
nightly dump. Moving to S3/R2 later is a module swap plus a re-upload.

## Not included

Declined during planning, listed so their absence is a decision rather than an
oversight: container log-rotation caps (`docker logs` can grow unbounded), UFW
/ fail2ban host hardening, and a search engine (Meilisearch would cost
200–300MB against the 2.5GB ceiling).

## Agentic SDLC (LangGraph.js)

The GitHub-Issues-driven SDLC automation (business-analyst / ui-designer /
dev-loop / quality-analyst / tech-lead) runs as a **LangGraph.js** graph,
triggered by GitHub issue/label/comment webhooks — not a polling loop. See
`.github/workflows/langgraph-agent.yml`, `src/agents/`, and `scripts/trigger.ts`.

### How it runs in production

Every `issues: [opened, labeled]` or `issue_comment: [created]` event fires
`langgraph-agent.yml`, which installs deps, installs Playwright's Chromium
browser, and runs `npx tsx scripts/trigger.ts --issue <n> --event <name>
--action <action>` on a fresh GitHub-hosted runner. `trigger.ts` re-fetches
the issue's *live* `status:*` label from GitHub (never trusting the webhook
payload — see `src/agents/state.ts`'s doc comment) and invokes the compiled
graph, which routes to the matching node (`ui_designer` / `dev_loop` /
`quality_analyst` / `tech_lead`) via `src/agents/graph.ts`'s conditional
edges. The run ends when that node finishes — there is no long-running
process, no cron backstop, and no persisted checkpoint between runs: GitHub's
own labels/comments are the durable state, by design (see the state-model
decision in `src/agents/state.ts`).

Required repo secrets: `ANTHROPIC_API_KEY` (a real Anthropic Console key —
distinct from any local Claude Code login), `LANGCHAIN_API_KEY`, and
`TECH_LEAD_GH_TOKEN` (the same tech-lead bot-identity token this repo's
`.claude/agents/tech-lead.md` already documents setting up — reuse it here,
no separate bot account needed).

### Running LangGraph Studio locally

Studio is a **local visualization/debugging tool only** — it never runs in
production; the workflow above always goes through `scripts/trigger.ts`.

```bash
# 1. Install deps (root-level project, separate from medusa/ and storefront/)
npm install

# 2. Copy the LangGraph section of .env.example into your local .env and fill
#    in ANTHROPIC_API_KEY / LANGCHAIN_API_KEY / TECH_LEAD_GH_TOKEN. `gh auth
#    login` must also be active locally, since the nodes shell out to the gh
#    CLI directly.

# 3. Launch Studio
npm run studio
# -> opens a local LangGraph Studio session showing all 4 routable nodes
#    (ui_designer, dev_loop, quality_analyst, tech_lead) and their
#    conditional edges. Invoke it with { issueNumber, currentLabel } against
#    a real (ideally low-stakes) open issue in this repo to trace a live run.
```

### Known limitation

The workflow only subscribes to `issues`/`issue_comment` events, not
`check_suite`/`workflow_run` completion. If `quality_analyst` or `tech_lead`
finds a PR's CI still pending, the run ends without retrying automatically —
unlike the old 3-minute poll, there's no built-in "come back in a few minutes"
here yet. A future addition would be a `check_suite: [completed]` trigger
(or a webhook filtered to the PR's own checks) re-invoking `trigger.ts` for
the linked issue once CI actually finishes.
