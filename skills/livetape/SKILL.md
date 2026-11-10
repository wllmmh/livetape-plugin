---
name: livetape
description: LiveTape (livetape.ai), the no-code platform where trading strategies are rules and agents run them live. Use to answer questions about LiveTape (strategies, rules, conditions, actions, variables, agents, accounts, markets including Polymarket prediction markets, backtests, plans) and to write or fix strategy JSON a user imports into LiveTape.
compatibility: scripts/validate-strategy.mjs needs Node.js 18 or later.
metadata:
  docs: https://livetape.ai/docs
---

# LiveTape

LiveTape lets people build trading strategies without code and run them live. A **strategy**
is a set of if/then rules; an **agent** is a running instance of a strategy, bound to an
account and one or more markets. Users build strategies in a visual editor, test them with
backtests, and deploy agents that trade around the clock on a sim (paper) account or a linked
real-money account.

## Route the request

| The user wants to… | Do this |
|---|---|
| Know how LiveTape works, what a feature does, where something is in the app | Answer from this file. Link the matching docs section (below) for more. |
| Get a strategy written, changed, explained or debugged | Follow **Writing a strategy** below. |
| Trade prediction markets (Polymarket up/down, price to beat) | Same, and read [references/examples-prediction-markets.md](references/examples-prediction-markets.md). |
| Use an API, an MCP server, or have you act on their account | Read [references/developer-api.md](references/developer-api.md). Neither exists yet. |

Answer only from this skill and the docs. When something is not covered, say so and point the
user to https://livetape.ai/docs or the in-app Help Center rather than guessing. Agents on
linked Coinbase accounts trade real money; say so whenever a question touches live trading.

## How LiveTape works

**Strategy.** Markets (instruments), variables, custom indicators and rules. Edited in the
strategy editor's tabs: Configuration (markets, evaluation mode, variables, notes),
Indicators (custom indicators), Rules, and Source (the JSON, with Build with AI). A strategy
does nothing until an agent runs it, and one strategy can run in many agents.

**Rule.** A label, one or more condition groups, and actions. The rule fires when every
condition in any one group is true: AND within a group, OR across groups.

**Condition.** `left operator right`, each side an expression: a number, price or volume, an
indicator (SMA, EMA, RSI, ATR, VWAP, Bollinger, MACD, Donchian, ADX, Stochastic, Parabolic
SAR, Z-Score, OBV), a reducer over a window (Highest, Lowest, Sum, Mean, Median, Mode, Std
Dev, Variance), arithmetic, a variable, a custom indicator, a time expression (seconds, minutes
or bars since/until a time; market open/close time), an account reader (position size, average
price, P/L, open orders, an order's stop or limit price), or a market reader (price to beat,
market status, seconds since the last tick). Expressions read the last closed bar unless told
otherwise (`[1]`; `[2]` is the bar before). Reading the still-forming bar (`[0]`) needs Pro.

**Actions.** Send order (market, limit, stop, stop-limit; crypto sized in USD by default or in
units; time in force and expiry), modify order, cancel order, close position, set variable,
clear variable, start agent (deploy another of the user's agents), stop agent (itself or
another), set market (swap the market in an instrument slot, or roll a recurring prediction
market to its next window).

**Variables.** Named values a strategy remembers: `prices`, `times`, `numbers`. Rules read
and write them. Their starting values can be overridden for each backtest and each deploy
without editing the strategy.

**Custom indicators.** A named expression (for example a price ratio between two markets)
that rules and reducers reuse like a built-in indicator.

**Evaluation.** A running agent checks every rule about once a second and on every bar close,
so a rule that stays true fires again; guards (no open position, no pending order, a cooldown)
prevent repeat orders. Backtests use the same evaluation logic.

**Markets.** Crypto (Coinbase, the default, and Kraken), US stocks and ETFs (NASDAQ, NYSE),
CME futures, OANDA forex, Polymarket prediction markets (outcome shares priced 0–1 that pay $1
if the outcome wins), and PolyBolt reference prices: the watch-only oracle feeds Polymarket's
up/down markets resolve on. Reference feeds can be charted and read by rules but never traded.
Chart intervals run from 1 second to 1 hour; sub-minute intervals need Pro.

**Agent.** Bound at deploy to a strategy, an account, its markets, variable overrides and risk
limits: max runtime, max drawdown ($), max drawdown (% of the session's starting balance),
and whether to cancel orders and close positions when a limit hits. Status is Running, Paused
(rules stop; resting orders, P/L and risk limits keep going) or Stopped. Open an agent from
the agent panel to see its overview and P/L, the Input tab (each rule's live condition
values), Variables, Positions and Orders tabs, and the Output log. The toolbar holds Start
Sim Agent / Start Live Agent, Pause, Resume and Stop; the "..." menu holds Close Positions,
Cancel Orders and Flatten Account (each acts on the agent's whole account, including other
agents' orders and positions there), the Public switch, and Delete Agent once stopped.

**Accounts.**
- LiveTape sim accounts: paper trading, one per asset class (stocks, futures, forex, crypto,
  predictions), $100,000 starting balance, resettable.
- Coinbase: linked with a Coinbase Developer Platform API key that has View and Trade
  permissions only. Agents on it trade real money on spot USD pairs, and every deploy and
  resume asks the user to confirm.
- Polymarket wallet: an existing wallet linked through Privy. LiveTape never holds the private
  key; never tell a user to export or paste one. Live Polymarket trading is not available
  yet, so prediction-market agents run on a sim predictions account.

**Backtests.** Instant Replay runs in the browser on the bars already loaded in the chart
(single market, market orders). Standard runs on the server over a chosen time range and
simulates stop and limit fills, slippage, commission and agent actions. Reports show an
equity curve, metrics, a chart with fills, the orders and the log. Reference feeds keep 48
hours of history, so backtests on them are limited to that.

**Sharing.** Agents are private unless made public. The Feed lists public agents, Following
lists agents the user follows, and My Agents lists their own. Clicking the strategy name on
an agent's page shows, read-only, the strategy it was started with.

**Build with AI.** In the strategy editor's Source tab, "Open in ChatGPT / Claude / Gemini /
Perplexity / Grok" starts a chat that reads this plugin (https://github.com/wllmmh/livetape-plugin);
the user pastes the JSON it returns and presses Import, which replaces the open strategy's
contents.

**Plans.** Free, Starter, Pro and Max differ in markets, order types, sub-minute intervals,
agent counts, runtime and backtest quotas. https://livetape.ai/pricing has the current table;
don't quote prices from memory.

## Docs sections
Link https://livetape.ai/docs#<id>: `overview`, `strategies`, `rules`, `conditions`,
`actions`, `variables`, `custom-indicators`, `variable-overrides`, `markets`,
`prediction-markets`, `reference-prices`, `agents`, `accounts`, `stopping-an-agent`,
`agent-controls`, `input-tab`, `agent-tabs`, `output-tab`, `sharing`, `backtests`,
`backtest-metrics`, `build-with-ai`.

## Writing a strategy

1. **Pin down the request.** You need the market(s), bar interval, entry signal, exit, order
   size and risk limits. Ask for what is missing when it changes the strategy; otherwise
   choose a sensible default and say which defaults you chose.
2. **Read [references/strategy-schema.md](references/strategy-schema.md)** in full. It is
   the authoritative list of functions, arguments, operators, actions and fields; use
   nothing outside it.
3. **Read the examples that match** the request:
   - [examples-signals.md](references/examples-signals.md): crossovers, candle shape, OR logic, VWAP, breakouts, multiple timeframes, cross-market series.
   - [examples-orders-and-exits.md](references/examples-orders-and-exits.md): sizing, stop losses, limit entries, brackets, profit exits, stale orders.
   - [examples-state-and-timing.md](references/examples-state-and-timing.md): cooldowns, session windows, session state, multi-step setups, stopping the agent.
   - [examples-prediction-markets.md](references/examples-prediction-markets.md): Polymarket up/down, price to beat, rolling to the next window.
4. **Compose** the rules. Every entry rule carries a guard against repeating; every position
   has an exit; sizes come from `numbers` variables so the user can change them at deploy.
5. **Validate.** When you can run commands, save the JSON to a file and run
   `node scripts/validate-strategy.mjs <file>` from this skill's directory. Fix every error;
   fix each warning or tell the user why it stays.
6. **Deliver** the JSON in one ```json block with no comments and no `id` fields, then a few
   lines: the assumptions you made, and how to import it (strategy editor → Source tab →
   paste → Import → Save). When the user is fixing a strategy, explain what was wrong.

When the user pastes a strategy and asks what it does, read it against the schema and explain
each rule in plain words: when it fires and what it does.
