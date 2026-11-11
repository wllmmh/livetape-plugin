# LiveTape developer API and MCP server (planned)

**Status: not available yet.** LiveTape has no public API keys, REST endpoints or MCP server
today. Everything below describes what is planned so you can answer questions about it; do
not call any LiveTape endpoint on the user's behalf and do not ask for their password or
session token.

## What to do today
Do each task in the LiveTape web app (https://livetape.ai):

| Task | In the app |
|------|------------|
| Save a strategy | Strategy editor → Source tab → paste the JSON → Import, then Save |
| Create an agent | Agent panel → Create Agent (below the list) |
| Start (deploy) an agent | Open the agent → Start Sim Agent or Start Live Agent → Deploy dialog |
| Pause / resume an agent | Open the agent → Pause Agent / Resume Agent |
| Stop an agent | Open the agent → Stop Agent |
| Delete an agent | Stop it, then "..." menu → Delete Agent |
| Read an agent's state | Open the agent: overview, Input, Variables, Positions and Orders tabs, Output log |

A strategy can also start, stop and re-target agents on its own through the START_AGENT,
STOP_AGENT and SET_MARKET actions (see [strategy-schema.md](strategy-schema.md)).

## Planned API
Access through API keys the user creates in LiveTape, each limited to what it may do.
Planned operations:

- List agents, and read an agent's status, P/L, positions, orders and event log
- Create and delete an agent
- Start (deploy) an agent with the Deploy dialog's settings
- Pause, resume and stop an agent
- Save a strategy (create or update from strategy JSON)

Endpoints, authentication details and plan availability are not published yet. Starting an
agent on a live (real-money) account will keep requiring the owner's explicit consent.

## Planned MCP server
An MCP server exposing the same operations as tools, so an assistant can save a strategy it
wrote and deploy, pause or stop agents directly. It will be declared in this plugin's
`mcp.json`, which lists no servers today. Until then, hand the user the strategy JSON and the
steps above.
