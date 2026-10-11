# Project skills

These skills load natively in any Claude Code session opened in this repo, and
`src/agents/prompts.ts` injects the same files into the LangGraph pipeline's
stage prompts — one rulebook for interactive and autonomous work.

## Vendored (third-party, pinned)

Copied verbatim at the commits below. Each directory keeps its upstream
`LICENSE`. Do not edit them in place — to update, re-download at a newer
commit and bump the table.

| Skill | Upstream | Commit | License | Used by the pipeline in |
|---|---|---|---|---|
| `grill-me`, `grilling` | [mattpocock/skills](https://github.com/mattpocock/skills) `skills/productivity/` | `49dd158d1076134a641b33efb035946536778336` | MIT | Stage 2 — Grill-me |
| `spec-driven-development`, `planning-and-task-breakdown` | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) `skills/` | `1be8e34187e34647bb83adc3a1323b26ae6f6abe` | MIT | Stage 3 — spec.md + parallel task plan |
| `shipping-and-launch` | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) `skills/` | `1be8e34187e34647bb83adc3a1323b26ae6f6abe` | MIT | Stage 7 — the pre-launch checklist and rollback plan the Ship stage enforces |
| `ponytail` | [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) `skills/ponytail/` | `9b58c1ffb790c075ca32e70a89cf1d80588f4abf` | MIT | Stage 4 — every coding subagent |
| `caveman` | [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) `skills/caveman/` | `2e08b9177c07bb7249a8a2d1a6758e5db281d002` | Apache-2.0 | Stage 4 — subagents' internal hand-off notes only (its own rules exempt code, commits, PRs, issues) |

## Project-specific

| Skill | Purpose |
|---|---|
| `competitor-gap-analysis` | Replaces the old polling `business-analyst` agent: research quinnsarte.com and file gap issues into the pipeline. Run on demand or from a scheduled routine. |
