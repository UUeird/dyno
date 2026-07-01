---
name: release
description: "Ship open work: commit, push, open/merge the PR, wait for the Vercel prod deploy, clean up the branch, move the board ticket. Use when the user says 'release', 'ship it', 'land this'. PR checks include CodeQL and a Vercel preview deploy; after merge, main's commit gets its own 'Vercel' commit status once production deploy finishes — that's the gate for moving the board ticket to done, not the merge itself."
---

Take one piece of open work from branch to merged, deployed, and cleaned up.
PR checks (CodeQL, Vercel preview) run automatically on GitHub — nothing to
configure, just wait for them. There's no separate test-gate workflow beyond
that, so this is a single-PR flow with no batching or "await CI" step of its
own. The one real wait is **after** merge: production deploy to Vercel.

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

Merging to `main` kicks off a production Vercel deploy — this is the real
"done" signal, not the merge itself. Poll the merge commit's status:

```
sha=$(git rev-parse origin/main)
gh api repos/{owner}/{repo}/commits/$sha/status --jq '.statuses[] | select(.context=="Vercel")'
```

Wait until `state` is `success`. If it comes back `failure` or `error`, stop
and report — don't move the board ticket, the deploy didn't actually ship.

### 5. Move the board ticket

Only after step 4 confirms the prod deploy succeeded: if the released work
corresponds to a story/subtask on the tada board, move it to `done`:
`mcp__tada__set_status` for the whole story, or `mcp__tada__set_subtask_status`
for just the subtask.

---

## After the release

Report what shipped: PR number, merged, deploy status, branch cleaned up.
Don't claim a branch is done unless it's actually merged and gone, and don't
move the board ticket until the prod deploy check is green.
