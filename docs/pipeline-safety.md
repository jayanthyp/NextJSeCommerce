# Pipeline Safety: Dry-Run by Default

Any pipeline automation that takes a **destructive/irreversible-ish** action
(closing PRs, force-relabeling, editing another PR's branch, reindexing a
search backend, etc. — not read-only checks or ordinary label transitions the
pipeline already does routinely) must default to a **dry-run** mode for its
first handful of scheduled runs.

## Convention

- Guard the destructive action behind an explicit opt-in flag:

  ```ts
  const dryRun = process.env.DRY_RUN !== "false";
  ```

- In dry-run mode, log what the automation *would* do without doing it, and
  post a summary somewhere visible (a tracking issue comment or workflow
  summary).

- Only flip to "live" after a human has skimmed the dry-run output once and
  explicitly sets `DRY_RUN=false`.

This is cheap insurance against the #162 class of incident — a bug that was
invisible in isolated code review but obvious the moment real API results were
involved.
