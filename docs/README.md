# Dyno Internal Docs

Living reference for the Dyno project. Audience: me + future Claude.

- **[product.md](product.md)** — what the app does. Core concepts (Experience, Car, Wishlist, Badge, etc.) and the user-facing flows.
- **[architecture.md](architecture.md)** — how it's built. Stack, process model, data flow, file organization, known tooling quirks.
- **[api.md](api.md)** — every endpoint with its request/response shape and side effects.
- **[deploy.md](deploy.md)** — step-by-step guide for deploying to Render + Vercel + Atlas.
- **[../plan.json](../plan.json)** — what's coming next, as a kanban board (managed via the tada MCP server / `python3 $TADA_HOME/server.py --data plan.json`).

For working conventions (run commands, test policy, gotchas), see [../CLAUDE.md](../CLAUDE.md).
For the user-facing README, see [../README.md](../README.md).
