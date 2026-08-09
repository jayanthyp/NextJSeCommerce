#!/usr/bin/env bash
# =============================================================================
#  tech-lead-merge.sh — merge a PR as the tech-lead bot identity, invoked by
#  .claude/agents/tech-lead.md's Workflow 3, and ONLY after its own gate has
#  already confirmed: approved + all CI green + VPS deploy succeeded +
#  post-deploy smoke test passed. This script does not re-check any of that
#  itself — it is the last, mechanical step once tech-lead has decided to
#  merge, not a second gate.
#
#  `.claude/settings.json` keeps a hard `deny` on raw `gh pr merge*` / `git
#  merge*` (mirroring CLAUDE.md's "never merge a PR" rule for every other
#  agent). This script is the one narrow, allow-listed exception: it always
#  runs a plain `--merge` with no other flags reachable from the outside, so
#  the allow rule for *this exact script* can never be walked into
#  `--admin` (bypasses required reviews/checks) or any other dangerous flag
#  the way a broad `Bash(gh pr merge*)` allow rule could.
#
#  Usage: tech-lead-merge.sh <pr-number>
# =============================================================================
set -euo pipefail

[ $# -eq 1 ] || { echo "[tech-lead-merge] usage: tech-lead-merge.sh <pr-number>" >&2; exit 1; }
[[ "$1" =~ ^[0-9]+$ ]] || { echo "[tech-lead-merge] PR number must be numeric, got: $1" >&2; exit 1; }
[ -n "${TECH_LEAD_GH_TOKEN:-}" ] || { echo "[tech-lead-merge] TECH_LEAD_GH_TOKEN is not set — see CLAUDE.md's tech-lead bot identity setup" >&2; exit 1; }

echo "[tech-lead-merge] merging PR #$1 as the tech-lead bot identity"
GH_TOKEN="$TECH_LEAD_GH_TOKEN" gh pr merge "$1" --merge
