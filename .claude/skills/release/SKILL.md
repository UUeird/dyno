---
name: release
description: "Ship open work: commit, push, open/merge the PR, clean up the branch, move the board ticket. Use when the user says 'release', 'ship it', 'land this'. This repo has no CI gate and no deploy pipeline yet — there is nothing to wait for between merge and cleanup. If that changes, extend this skill to await the gate/deploy before cleanup, mirroring tada's /release."
---

Take one piece of open work from branch to merged and cleaned up. Dyno has **no
GitHub Actions test gate and no deploy pipeline** (only `.github/dependabot.yml`
exists) — so this is a single-PR flow with no batching, no "await CI," and no
"wait for deploy" step. Don't invent one.

### 1. Finish and push

- If there's uncommitted or unpushed work, commit it. **Never push known-red** —
  run the relevant Playwright spec for the feature first (see CLAUDE.md
  "Running tests": `npx playwright test tests/<spec>.spec.ts`, run from
  `dyno-react-app/`, only the spec relevant to what changed). Fix any failure in
  the same commit before pushing.
- Open the PR if there isn't one, or refresh the body (`gh pr edit`) so it
  describes everything on the branch.
- Pushing fires the Qase sync pre-push hook automatically (non-blocking — a
  warning prints if Qase is unreachable, the push still proceeds). No action
  needed unless it warns about something you should look at.

### 2. Merge

- No CI gate to wait for. Merge once you've confirmed the relevant tests pass
  locally: `gh pr merge <PR#> --squash` (squash is the convention here — see
  git history).
- If `gh pr checks` reports anything (e.g. a Dependabot-triggered check), don't
  merge over a red one — stop and report.

### 3. Clean up the branch

```
git checkout main && git pull --ff-only
git branch -d <branch>
git push origin --delete <branch>
```

A squash-merge makes `git branch -d` warn "not yet merged to HEAD" and delete
anyway — expected. If it *refuses*, stop and check why instead of forcing `-D`.

### 4. Move the board ticket

If the released work corresponds to a story/subtask on the tada board, move it
to `done`: `mcp__tada__set_status` for the whole story, or
`mcp__tada__set_subtask_status` for just the subtask.

---

## After the release

Report what shipped: PR number, merged, branch cleaned up. Don't claim a
branch is done unless it's actually merged and gone.
