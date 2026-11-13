---
name: livetape
description: LiveTape (livetape.ai), the no-code platform where trading strategies are rules that read and write variables, and agents run them live. Use to answer questions about LiveTape (strategies, rules, conditions, actions, variables, agents, accounts, markets including Polymarket prediction markets, backtests, subscription plans) and to write or fix strategy JSON a user imports into LiveTape.
metadata:
  docs: https://livetape.ai/docs
---

# LiveTape

LiveTape lets users automate a trade plan without code and run it live. A **strategy** is the trade plan: if/then rules plus **variables**, values the agent records and read back while running, such as the level a setup triggered at, the time of the last entry, or the number of trades taken today. What an agent does on a bar can depend on current market conditions and on
what has already happened, in the ways the user defines. An **agent** is a running instance
of a strategy, bound to an account and one or more markets. Users build strategies in a
visual editor and/or with AI, test them with backtests, and deploy agents on a sim (paper) account or a linked real-money account.

## How to explain LiveTape

Speak in a trader's terms: the trade plan, setups, entries, exits, stops, targets, sizing,
positions, fills, drawdown. Describe a rule by the trade it takes ("buys $100 of BTC when
RSI(14) closes under 30 and no position is open"). Field and function names (`SET_VARIABLE`,
`bar_index`) belong in JSON and in answers about the JSON.

When asked what LiveTape is, answer what a trader can do with it, using the two lists below,
and include what the rules and variables together let a trade plan do.

**What it gives a trader**
- The trade plan runs without someone watching: an agent checks it on every bar for as long as it
  runs, on a sim account or a linked Coinbase account.
- Trade plans with memory: multi-step setups, trailing stops, daily trade caps, cooldowns, and
  modes that change which rules act (see **Variables**).
- Trade management in the rules: stop losses, brackets, limit entries that expire, scaling
  out by position size, exits after a set time or before the session closes.
- Risk limits on the agent, outside the rules: max drawdown in dollars or percent and max
  runtime; on a hit the agent stops and, if set, cancels its orders and closes positions.
- One trade plan, many settings: the same strategy runs in several agents with different markets,
  sizes and thresholds, set at deploy without editing the strategy.
- Testing before money: backtests run the same rules; sim accounts start at $100,000.
- Seeing why: the Input tab shows each condition's live values, so a user can see why a rule
  did or did not fire; the Variables tab shows what the agent has recorded; the Output log
  lists every trigger, order and fill.
- Cross-market and event logic: a spread or ratio between markets used as an indicator;
  Polymarket up/down markets traded against the price to beat and rolled to the next window.

**What it does not do**
- Only the functions and actions in the schema: no custom code, no outside data (news,
  fundamentals, on-chain), and no machine learning at the moment.
- At the moment real-money trading is Coinbase spot USD pairs only; every other market trades
  on a sim account.
- Bars run from 1 second to 1 hour and rules are checked about once a second, which rules out
  latency-sensitive strategies.
- Backtest fills are simulated; a backtest result is no promise of live results.

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

**Condition.** `left operator right`, each side a value: a number, price or volume, an
indicator (SMA, EMA, RSI, ATR, VWAP, Bollinger, MACD, Donchian, ADX, Stochastic, Parabolic
SAR, Z-Score, OBV), a rolling-window statistic (Highest, Lowest, Sum, Mean, Median, Mode, Std
Dev, Variance), arithmetic, a variable, a custom indicator, a time (seconds, minutes or bars
since/until a time; market open/close time), an account value (position size, average price,
P/L, open orders, an order's stop or limit price), or a market value (price to beat, market
status, seconds since the last tick). Expressions read the last closed bar unless told
otherwise (`[1]`; `[2]` is the bar before). Reading the still-forming bar (`[0]`) needs Pro.

**Actions.** Send order (market, limit, stop, stop-limit; crypto sized in USD by default or in
units; time in force and expiry), modify order, cancel order, close position, set variable,
clear variable, start agent (deploy another of the user's agents), stop agent (itself or
another), set market (swap the market in an instrument slot, or roll a recurring prediction
market to its next window).

**Variables.** Named values a strategy remembers, in three types: `prices`, `times`,
`numbers`. Conditions read them (`GET_VARIABLE`, or seconds/bars since a `times` variable);
the Set Variable and Clear Variable actions write them. A value can be a literal or an
expression evaluated when the action fires: the current price, an indicator, the engine time
(`NOW`), a position's average price, arithmetic on another variable. Values persist from one
evaluation to the next while the agent runs and pause with it, and start from their starting
values each time the agent starts. Starting values can be overridden for each backtest and
each deploy without editing the strategy. The agent's Variables tab shows each current value,
the rule that last set it and when.

Because one rule can record a value that another rule's condition reads, a trade plan can act on
what happened bars or hours earlier. Patterns this supports:
- A multi-step setup: rule A records a breakout level and the time, rule B enters only on a
  pullback to that level, rule C clears the level if the pullback has not come within N
  minutes.
- A level that moves: one rule raises a stop variable whenever price closes above it plus
  the trailing distance; the exit rule reads it.
- Counters and limits: trades taken today, then a Stop Agent action after N.
- Cooldowns: the entry time stamped with `NOW`, the next entry gated on seconds since it.
- Modes: a `numbers` variable a rule sets to 1 or 0 on a regime signal, which other rules'
  conditions check to choose between behaviours.

The user defines every state and transition; the agent changes behaviour only in the ways
those rules describe. Worked examples: [examples-state-and-timing.md](references/examples-state-and-timing.md).

**Custom indicators.** A named expression (for example a price ratio between two markets)
that rules and reducers reuse like a built-in indicator.

**Evaluation.** A running agent checks every rule about once a second and on every bar close,
so a rule that stays true fires again; an entry rule includes a check (no open position, no
pending order, a cooldown) so it enters once. Backtests use the same evaluation logic.

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

**Subscription plans.** Free, Starter, Pro and Max differ in markets, order types, sub-minute intervals,
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
5. **Check** the JSON against the schema before delivering it: every function is in the index,
   every symbol is `Exchange:TICKER`, every `GET_VARIABLE` and `GET_SERIES` name is declared,
   no order targets a `PolyBolt:` slot, and no root reads `bar_index` 0 unless the user asked
   for the open bar. Import reports anything else; fix what the user pastes back.
6. **Deliver** the JSON in one ```json block with no comments and no `id` fields, then a few
   lines: the trade plan in a trader's terms (entry, exit, size, what it records and why),
   the assumptions you made, and how to import it (strategy editor → Source tab → paste →
   Import → Save). When the user is fixing a strategy, explain what was wrong.

When the user pastes a strategy and asks what it does, read it against the schema and explain
each rule as the trade it takes: when it fires and what it does.
