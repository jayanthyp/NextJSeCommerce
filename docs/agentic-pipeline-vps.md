# Agentic pipeline — VPS services and secrets

The 7-stage pipeline (`src/agents/`, run by `.github/workflows/langgraph-agent.yml`)
uses two services that live on the VPS next to the store:

| Service | Port (127.0.0.1 only) | Used for |
| --- | --- | --- |
| **OmniRoute** | 20128 | Model gateway. Each pipeline role calls a *combo* that spends free-tier models first and falls back to DeepSeek last. |
| **claude-mem** | 37777 | Cross-run memory: stage 1 recalls past issues and decisions; stages 2 and 7 record new ones. |

Neither port is exposed publicly. Each workflow run opens an SSH tunnel with
the deploy key (`VPS_HOST` / `VPS_USER` / `VPS_SSH_KEY`, already used by
`deploy-vps.yml`) and only uses a service if it answers. If the VPS or a
service is down, models go straight to direct DeepSeek and memory is skipped,
so the pipeline keeps working.

## 1. Install the services (once, on the VPS)

```bash
ssh <VPS_USER>@<vps>
cd /opt/NextJSeCommerce && git pull --ff-only
bash scripts/vps/setup-ai-services.sh
```

The script:

- installs pinned `omniroute` and `claude-mem` versions;
- generates OmniRoute's secrets once, in `~/.config/omniroute/omniroute.env` (mode 600);
- binds OmniRoute to `127.0.0.1` with `REQUIRE_API_KEY=true`. Its shipped default is all interfaces with no key, and this VPS has no firewall;
- registers both as systemd services with memory caps (640M / 768M) and prints the dashboard password.

OmniRoute needs Node ≥ 22.22. **RAM:** the store's containers are capped at
~2.8G on a 4G box. Check `free -m` and `docker stats` before enabling, and
consider a RAM upgrade if headroom is tight.

## 2. Configure OmniRoute (once, from your machine)

```bash
ssh -L 20128:127.0.0.1:20128 <VPS_USER>@<vps>
# open http://localhost:20128 and log in with the printed password, then change it
```

1. **Providers.** Connect the free-tier providers you want to use, plus DeepSeek with your DeepSeek API key.
   Every model in a combo must support tool calling: the pipeline gets
   structured output by forcing one tool call. Some "free" providers work by
   reusing a consumer app's OAuth login, so check each provider's terms allow
   automated use before adding it.
2. **Combos.** Use priority/fill-first ordering, and put DeepSeek **last** in every combo:

   | Combo | Role | Put first |
   | --- | --- | --- |
   | `sdlc-orchestrator` | Grill-me, spec, fix triage, escalation | strongest free reasoning/coding models |
   | `sdlc-worker` | coding subagents | strong free coding models |
   | `sdlc-worker-light` | mechanical subagent tasks | fast free models |
   | `sdlc-memory` | claude-mem's summaries | any fast free model |

   Different names? Set the repo variables `OMNIROUTE_ORCHESTRATOR_COMBO`,
   `OMNIROUTE_WORKER_COMBO`, `OMNIROUTE_WORKER_LIGHT_COMBO`.
3. **API keys.** Create two:
   - one for the pipeline → GitHub secret `OMNIROUTE_API_KEY`;
   - one for claude-mem → on the VPS: `bash scripts/vps/setup-ai-services.sh --memory-key <key>`.

## 3. GitHub secrets and variables

| Name | Kind | Required | Notes |
| --- | --- | --- | --- |
| `OMNIROUTE_API_KEY` | secret | for OmniRoute | from step 2.3 |
| `TYPESAFE_API_KEY` | secret | **yes** | Jev (stage 6). Without it every PR blocks at review. |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL` | secrets | yes (fallback) | Existing direct-DeepSeek config: the fallback after OmniRoute. |
| `TECH_LEAD_GH_TOKEN` | secret | yes | Existing tech-lead bot token: the Ship stage's approve/merge/rollback. |
| `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` | secrets | yes | Existing deploy secrets, reused for the tunnel. |
| `VPS_SSH_KNOWN_HOSTS` | secret | recommended | Output of `ssh-keyscan <vps>`, which pins the host key for the tunnel. |
| `JEV_PASS_THRESHOLD` | variable | no | Default `0.8`: the minimum probability of the wanted answer per check. |
| `JEV_MAX_COMPLEXITY` | variable | no | Default `1.5` on the 0 (minimal) … 4 (bloated) scale. |
| `MAX_JEV_ROUNDS` | variable | no | Default `3`: rejections sent back to the subagents before you are asked. |
| `JEV_BASE_URL`, `JEV_MODEL` | variables | no | Default `https://api.typesafe.ai` / `jev-latest`. For OpenRouter: `https://openrouter.ai/api` / `~typesafe/jev-latest`. |

## 4. Verify

```bash
# on the VPS
systemctl status omniroute claude-mem
curl -s http://127.0.0.1:37777/api/health

# locally, Jev against an issue that has a locked spec and an open PR (no labels/comments touched)
npm run jev-review -- --issue <n>
```

In a workflow run, the **Open SSH tunnel** step logs `OmniRoute reachable` and
`claude-mem reachable`. Every model call logs which provider served it
(`[llm] … omniroute model=…`).
