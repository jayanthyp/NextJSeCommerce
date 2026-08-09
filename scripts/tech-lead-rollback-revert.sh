#!/usr/bin/env bash
# =============================================================================
#  tech-lead-rollback-revert.sh — revert a bad merge commit on `main` and
#  push the revert, invoked by .claude/agents/tech-lead.md's Workflow 3 only
#  when a post-merge VPS deploy or smoke test fails. This is a `git revert`
#  (a new commit undoing the change) — never a `reset --hard` or
#  force-push — specifically so it's safe to allow-list narrowly.
#
#  `.claude/settings.json` keeps a hard `deny` on `git push*origin main*`
#  (mirroring CLAUDE.md's "never push to main" rule). This script is the one
#  narrow, allow-listed exception: it only ever runs `git revert -m 1
#  <sha> --no-edit` followed by a plain `git push origin main` — no force
#  flag is reachable from the outside, so the allow rule for *this exact
#  script* can't be walked into `--force`/`-f` the way a broad
#  `Bash(git push*origin main*)` allow rule could.
#
#  Usage: tech-lead-rollback-revert.sh <merge-sha>
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

[ $# -eq 1 ] || { echo "[tech-lead-rollback-revert] usage: tech-lead-rollback-revert.sh <merge-sha>" >&2; exit 1; }
[[ "$1" =~ ^[0-9a-f]{7,40}$ ]] || { echo "[tech-lead-rollback-revert] argument must be a git SHA, got: $1" >&2; exit 1; }
[ -n "${TECH_LEAD_GH_TOKEN:-}" ] || { echo "[tech-lead-rollback-revert] TECH_LEAD_GH_TOKEN is not set — see CLAUDE.md's tech-lead bot identity setup" >&2; exit 1; }

echo "[tech-lead-rollback-revert] fetching main"
git fetch origin main

echo "[tech-lead-rollback-revert] checking out main"
git checkout main
git pull --ff-only

echo "[tech-lead-rollback-revert] reverting $1 (merge parent 1, no editor)"
git revert -m 1 "$1" --no-edit

echo "[tech-lead-rollback-revert] pushing revert to main as the tech-lead bot identity"
ORIGIN_URL="$(git remote get-url origin)"
REPO_PATH="${ORIGIN_URL#*github.com[:/]}"
REPO_PATH="${REPO_PATH%.git}"
git push "https://x-access-token:${TECH_LEAD_GH_TOKEN}@github.com/${REPO_PATH}.git" main
