---
name: release
description: "Ship open work: commit, push, open/merge the PR, wait for the prod deploys, clean up the branch, move the board ticket. Use when the user says 'release', 'ship it', 'land this'. PR checks include CodeQL and a Vercel preview deploy; after merge, the gate for moving the board ticket to done is the live frontend and backend serving the merged commit, not the merge itself."
---

Take one piece of open work from branch to merged, deployed, and cleaned up.
PR checks (CodeQL, Vercel preview) run automatically on GitHub — nothing to
configure, just wait for them. There's no separate test-gate workflow beyond
that, so this is a single-PR flow with no batching or "await CI" step of its
own. The one real wait is **after** merge: the production deploys.

### 1. Finish and push

- If there's uncommitted or unpushed work, commit it. **Never push known-red** —
  run the relevant Playwright spec for the feature first (see CLAUDE.md
  "Running tests": `npx playwright test tests/<spec>.spec.ts`, run from
  `dyno-react-app/`, only the spec relevant to what changed). Fix any failure in
  the same commit before pushing.
- Open the PR if there isn't one, or refresh the body (`gh pr edit`) so it
  describes everything on the branch.

### 2. Merge

- Wait for `gh pr checks <PR#>` to go green (CodeQL analyze, Vercel preview
  deploy). Don't merge over a red or still-pending one — poll, don't guess.
- Merge with `gh pr merge <PR#> --squash` (squash is the convention here — see
  git history).

### 3. Clean up the branch

```
git checkout main && git pull --ff-only
git branch -d <branch>
git push origin --delete <branch>
```

A squash-merge makes `git branch -d` warn "not yet merged to HEAD" and delete
anyway — expected. If it *refuses*, stop and check why instead of forcing `-D`.

### 4. Wait for the prod deploy

Merging to `main` kicks off production deploys — these are the real "done"
signal, not the merge itself. Both the frontend and the backend report the
commit they're serving, so check the live sites rather than trusting a status.

**Frontend (Vercel).** Poll until the live site serves `main`:

```
sha=$(git rev-parse origin/main)
curl -s https://www.dynoapp.co/version.json | jq -r .commit    # wait for this to equal $sha
```

While waiting, also watch Vercel's commit status as an early failure signal:

```
gh api repos/{owner}/{repo}/commits/$sha/status --jq '.statuses[] | select(.context=="Vercel")'
```

If its `state` is `failure` or `error`, stop and report — don't move the board
ticket, the deploy didn't ship. A *missing* status is not a failure (Vercel
sometimes never posts one); `version.json` decides. If the site still isn't
serving `$sha` after ~10 minutes, stop and report.

**Backend (Render).** Render posts nothing to GitHub, so check `/healthz`:

```
deployed=$(curl -s https://api.dynoapp.co/healthz | jq -r .commit)
git diff --quiet "$deployed" origin/main -- dyno-react-app/backend && echo "backend current"
```

The backend is current when nothing under `dyno-react-app/backend` differs
between the deployed commit and `main` — it won't always *be* `main`'s SHA,
since a frontend-only merge may not redeploy it. If the release touched the
backend, poll until this passes (a Render deploy takes a few minutes). If it
hasn't passed after ~10 minutes, stop and report rather than moving the ticket.

### 5. Move the board ticket

Only after step 4 confirms production is serving the merged code: if the released work
corresponds to a story/subtask on the tada board, move it to `done`:
`mcp__tada__set_status` for the whole story, or `mcp__tada__set_subtask_status`
for just the subtask.

---

## After the release

Report what shipped: PR number, merged, deploy status, branch cleaned up.
Don't claim a branch is done unless it's actually merged and gone, and don't
move the board ticket until step 4's checks pass.
