#!/usr/bin/env node
/**
 * Creates (or updates) every status:* label the pipeline uses. `gh issue edit
 * --add-label` fails on a label that doesn't exist yet, so the agent workflow
 * runs this before the graph; `--force` makes it idempotent.
 */
import { execFileSync } from "node:child_process";
import { LABEL } from "../src/agents/config.js";

const DESCRIPTIONS: Record<string, [color: string, description: string]> = {
  [LABEL.readyForDev]: ["0e8a16", "Pipeline entry: Grill-me → spec → build (or straight to build if a spec is locked)"],
  [LABEL.readyForUiWork]: ["0e8a16", "Legacy entry label — same as status:ready-for-dev"],
  [LABEL.grilling]: ["fbca04", "Stage 2 running: Grill-me"],
  [LABEL.awaitingAnswers]: ["d93f0b", "Waiting for the owner to answer Grill-me questions"],
  [LABEL.designing]: ["fbca04", "Stage 3 running: writing and locking the spec"],
  [LABEL.inProgress]: ["fbca04", "Stage 4-5 running: parallel subagents + unit tests"],
  [LABEL.inReview]: ["1d76db", "PR open, awaiting Jev review"],
  [LABEL.jevReview]: ["fbca04", "Stage 6 running: Jev review"],
  [LABEL.readyForQa]: ["1d76db", "Jev passed, awaiting Playwright E2E"],
  [LABEL.qaInProgress]: ["fbca04", "Playwright E2E running"],
  [LABEL.readyToShip]: ["1d76db", "Jev + E2E passed, awaiting the gated ship"],
  [LABEL.deploying]: ["fbca04", "Stage 7 running: approve → deploy → smoke → merge"],
  [LABEL.blocked]: ["b60205", "Blocked — escalation stage will give direction or ask the owner"],
  [LABEL.blockedArchitecture]: ["b60205", "Needs an owner decision; reply on the issue to resume"],
  [LABEL.blockedDeploy]: ["b60205", "Deploy failed; reply \"retry\" to ship again"],
};

for (const [name, [color, description]] of Object.entries(DESCRIPTIONS)) {
  execFileSync("gh", ["label", "create", name, "--repo", "jayanthyp/NextJSeCommerce", "--color", color, "--description", description, "--force"], { stdio: "inherit" });
}
