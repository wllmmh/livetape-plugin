# LiveTape plugin

Teaches your AI assistant [LiveTape](https://livetape.ai), the no-code platform where trading
strategies are if/then rules that read and write variables, and agents run them live. With it, an assistant can answer
questions about LiveTape and write strategy JSON you import straight into the strategy editor.

This is an [Agent Plugins 1.0.0](https://agent-plugins.org/specification) package. Its skill
follows the [Agent Skills](https://agentskills.io) format, so it also works on its own in any
client that loads skills.

## What's inside

```
plugin.json          plugin manifest
mcp.json             MCP servers (coming soon; see below)
.claude-plugin/
├── plugin.json      the same manifest for Claude Code, which reads only this one
├── marketplace.json Claude Code marketplace listing this plugin
└── icon.png
skills/
└── livetape/
    ├── SKILL.md     how LiveTape works, and how to write a strategy
    └── references/  the strategy schema, worked examples, the planned developer API
```

## Install

In Claude Code (this repository is also a plugin marketplace):

```
/plugin install livetape --marketplace wllmmh/livetape-plugin
```

On Claude Code before 2.1.275, add the marketplace first:

```
/plugin marketplace add wllmmh/livetape-plugin
/plugin install livetape@livetape
```

In other clients, add this repository as a plugin if the client supports Agent Plugins, or
copy `skills/livetape` into its skills folder.

## Use

Ask about LiveTape ("How does pausing an agent differ from stopping it?") or ask for a
strategy ("Buy $100 of BTC when RSI(14) drops below 30 on 1-hour bars; close above 70"). The
assistant returns strategy JSON; in LiveTape, open the strategy editor's **Source** tab,
paste it, click **Import**, then **Save**. Backtest before you deploy.

## Coming later

LiveTape has no public API or MCP server yet. When it does, `mcp.json` will declare the
server, so an assistant can save strategies and start, pause and stop agents for you.

## Layout rules

- Each skill is a direct child of `skills/` with a `SKILL.md` whose `name` matches its folder.
  Clients look only one level down.
- MCP servers go in `mcp.json` under `mcpServers`: a hosted server as
  `{ "type": "streamable-http", "url": "https://…" }` (never with an API key in `headers`), a
  local one as `{ "type": "stdio", "command": "./bin/…" }`.
- Bump `version` in `plugin.json` with every release, and in `.claude-plugin/plugin.json`,
  which repeats its fields for Claude Code.

## Documentation

- LiveTape docs: https://livetape.ai/docs

## License

[Apache-2.0](LICENSE). The license grants no rights to the LiveTape name or logo.
