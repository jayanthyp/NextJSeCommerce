#!/usr/bin/env bash
# =============================================================================
#  tech-lead-approve.sh — post a formal GitHub PR approval as the tech-lead
#  bot identity, invoked by .claude/agents/tech-lead.md's Workflow 1.
#
#  GitHub refuses to let an account approve its own PR (addPullRequestReview:
#  "Can not approve your own pull request") — and every other agent in this
#  repo (dev-loop, quality-analyst, ui-designer, business-analyst) opens PRs
#  under the same account this session's `gh` is normally authenticated as.
#  A real "Approved" review therefore requires a *different* GitHub identity,
#  which is what TECH_LEAD_GH_TOKEN is: a separate bot account's token, used
#  only for this one action.
#
#  This script exists (rather than tech-lead.md calling `gh pr review
#  --approve` directly) so `.claude/settings.json` can allow-list exactly
#  this invocation shape — no PR-number or body injection can smuggle in
#  extra `gh` flags the way a raw `Bash(gh pr review *)` allow rule could.
#
#  Usage: tech-lead-approve.sh <pr-number>   (review body piped via stdin)
# =============================================================================
set -euo pipefail

[ $# -eq 1 ] || { echo "[tech-lead-approve] usage: tech-lead-approve.sh <pr-number> (body via stdin)" >&2; exit 1; }
[[ "$1" =~ ^[0-9]+$ ]] || { echo "[tech-lead-approve] PR number must be numeric, got: $1" >&2; exit 1; }
[ -n "${TECH_LEAD_GH_TOKEN:-}" ] || { echo "[tech-lead-approve] TECH_LEAD_GH_TOKEN is not set — see CLAUDE.md's tech-lead bot identity setup" >&2; exit 1; }

BODY="$(cat -)"
[ -n "$BODY" ] || { echo "[tech-lead-approve] empty review body on stdin" >&2; exit 1; }

echo "[tech-lead-approve] posting APPROVE review on PR #$1 as the tech-lead bot identity"
GH_TOKEN="$TECH_LEAD_GH_TOKEN" gh pr review "$1" --approve --body "$BODY"
