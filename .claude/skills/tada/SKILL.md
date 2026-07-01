---
name: tada
description: "The core build loop. Look at the prod board, pick up the next story marked In Progress, and start work on it — prioritizing any In Progress tasks within it."
---

The prod board at `https://tada-board.fly.dev/api/projects/dyno` is the source of
truth (see CLAUDE.md "Board workflow"). Local JSON files may be stale, so always
read the live board.

1. **Read the live board.** Use the `tada` MCP `view_board` tool scoped to
   the columns this loop needs: `status: ["in-progress", "planned"]`. That keeps
   the output small on a large board (the Idea/Done columns are the bulk) while
   still showing In Progress and the Planned fallback. Do **not** pass a `type`
   filter — In Progress items can be any type, and a `type`-filtered view will
   miss them. If you later need the whole board (e.g. searching Idea/Done), call
   `view_board` again with no `status`. If `view_board` looks stale, fall back to
   the raw API: `curl -s https://tada-board.fly.dev/api/projects/dyno`, but ask
   for permission first.

2. **Find the In Progress story.**
   - If the In Progress column is **empty**, say so. Don't invent work — report
     what's in Planned and ask whether to pull one forward.
   - If there's exactly one, that's the story.
   - If there's more than one, pick the one at the top of the list.

3. **Pick what to work on within the story.**
   - If the story has any **tasks (subtasks) marked `in-progress`**, prioritize
     those — work the in-progress task(s) first.
   - Otherwise take the story as a whole (work its `todo` subtasks in order). If the story has no subtasks, work the story itself. If the story has a subtask that looks too complex to complete in one session, ask for guidance before starting.

4. **Confirm and start.** Briefly state which story (and subtask, if any) you're
   picking up, then begin. Follow the normal repo workflow: branch first if on
   `main`, run the relevant tests, commit/PR proactively.

5. **Move the ticket when done** (CLAUDE.md "Board workflow"): use `set_status`
   to move the whole story to `done`, or `set_subtask_status` to move just the
   subtask you completed.

Shorthand used elsewhere: **BV** = Board View, **SDV** = Story Detail View.
