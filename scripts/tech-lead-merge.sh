#!/usr/bin/env bash
# =============================================================================
#  tech-lead-merge.sh — merge a PR as the tech-lead bot identity, invoked by
#  the agentic pipeline's Ship stage (src/agents/stages/ship.ts), and ONLY
#  after its gate has already confirmed: Jev + E2E passed on the head commit,
#  approved, all CI green, VPS deploy succeeded, post-deploy smoke test
#  passed. This script does not re-check any of that itself — it is the last,
#  mechanical step once the Ship stage has decided to merge, not a second gate.
#
#  `.claude/settings.json` keeps a hard `deny` on raw `gh pr merge*` / `git
#  merge*` (mirroring CLAUDE.md's "never merge a PR" rule). This script is
#  the one narrow exception: it always runs a plain `--merge` with no other
#  flags reachable from the outside, so it can never be walked into
#  `--admin` (bypasses required reviews/checks) or any other dangerous flag.
#
#  Usage: tech-lead-merge.sh <pr-number>
# =============================================================================
set -euo pipefail

[ $# -eq 1 ] || { echo "[tech-lead-merge] usage: tech-lead-merge.sh <pr-number>" >&2; exit 1; }
[[ "$1" =~ ^[0-9]+$ ]] || { echo "[tech-lead-merge] PR number must be numeric, got: $1" >&2; exit 1; }
[ -n "${TECH_LEAD_GH_TOKEN:-}" ] || { echo "[tech-lead-merge] TECH_LEAD_GH_TOKEN is not set — see CLAUDE.md's tech-lead bot identity setup" >&2; exit 1; }

echo "[tech-lead-merge] merging PR #$1 as the tech-lead bot identity"
GH_TOKEN="$TECH_LEAD_GH_TOKEN" gh pr merge "$1" --merge
