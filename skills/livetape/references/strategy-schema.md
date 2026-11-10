# LiveTape strategy schema

The complete wire format of a LiveTape strategy: every function, operator, action and field
the engine accepts. Use only what is listed here. When a mechanic is not directly
expressible, compose it from these primitives; variables, math nodes and the account readers
usually cover it.

A strategy is a JSON object. Its rules hold conditions, and every value in a condition is an
ExpressionNode tree, which the backend resolves recursively against live market data. On each
evaluation cycle every rule whose conditions are true fires its actions. The engine runs a
cycle about once a second and on every bar close, so **a rule whose conditions stay true fires
again on the next cycle**. Guard conditions (position size, pending-order count, a cooldown
or a flag variable) are what stop repeated orders; put them in every entry rule.

## EXPRESSION NODE
Every expression is an ExpressionNode:
{
  "function": "<FUNCTION_NAME>",
  "arguments": { ... function-specific args ... },
  "bar_index": 1          // at the root, 1 = last closed bar; nested, adds 1 bar to the parent
}

bar_index is a temporal offset. At a root operand it counts back from the open bar: 0 is the
open (still-forming) bar, 1 the last fully closed bar, 2 two bars ago; omitted means 1. Reading
bar 0 needs the Pro plan or above, so use 1 unless the user asks for the live bar. Inside
another expression it is relative, effective_offset = parent_offset + bar_index: 0 (or
omitted) means the same bar as its parent and 1 adds another bar of lookback.

Math nodes are transparent: each argument of a root math node is itself a root operand. In
SUBTRACT(CLOSE_PRICE, ATR) give both arguments bar_index 1 for the last closed bar; 0 there
would read the open bar.

Only bar-reading functions use bar_index: bar primitives, indicators, iterators and
GET_SERIES. Variable, temporal, account, time, market and literal functions ignore it; omit
it on them.

Optional node fields (usually omitted):
- "symbol": an InstrumentRef (see below) — read market data for another of the strategy's
  instruments instead of the primary one.
- "bar_interval": one of the barInterval values (see STRATEGY DEFINITION SHAPE) — read this
  node's market data at a different bar interval than the instrument's default.

## COMPLETE FUNCTION INDEX
Every function usable inside an ExpressionNode. This table is authoritative — do not use
any function name not listed here. `bar_index` shifts the read unless the notes say otherwise.

| Function              | Category   | Arguments                                                                 | Returns / notes |
|-----------------------|------------|---------------------------------------------------------------------------|-----------------|
| CLOSE_PRICE           | primitive  | {}                                                                        | close of the bar (offset-sensitive) |
| OPEN_PRICE            | primitive  | {}                                                                        | open |
| HIGH_PRICE            | primitive  | {}                                                                        | high |
| LOW_PRICE             | primitive  | {}                                                                        | low |
| VOLUME                | primitive  | {}                                                                        | volume |
| ADD                   | math       | [a, b]                                                                    | a + b (positional; no bar_index) |
| SUBTRACT              | math       | [a, b]                                                                    | a − b (positional; no bar_index) |
| MULTIPLY              | math       | [a, b]                                                                    | a × b (positional; no bar_index) |
| DIVIDE                | math       | [a, b]                                                                    | a ÷ b (positional; no bar_index) |
| ABS                   | math       | [value]                                                                   | absolute value (positional; no bar_index) |
| SMA                   | indicator  | { period:int, source?:node }                                             | simple moving average |
| EMA                   | indicator  | { period:int, source?:node }                                             | exponential moving average |
| RSI                   | indicator  | { period:int (14), source?:node }                                        | 0–100 |
| ATR                   | indicator  | { period:int (14), high?:node, low?:node, close?:node }                  | average true range |
| VWAP                  | indicator  | { period:int (14), price?:node, volume?:node }                           | rolling volume-weighted mean |
| BOLLINGER             | indicator  | { period:int (14), source?:node, stdev:num (2), output:"middle"|"upper"|"lower" } | one band (default "middle") |
| MACD                  | indicator  | { fast_period:int (12), slow_period:int (26), signal_period:int (9), source?:node, output:"macd"|"signal"|"histogram" } | default "macd" |
| DONCHIAN              | indicator  | { period:int (20), high?:node, low?:node, output:"upper"|"middle"|"lower" } | reads High/Low series; default "middle" |
| ADX                   | indicator  | { period:int (14), high?:node, low?:node, close?:node, output:"adx"|"plus_di"|"minus_di" } | default "adx" |
| STOCHASTIC            | indicator  | { period:int (14), signal_period:int (3), high?:node, low?:node, close?:node, output:"k"|"d" } | 0–100; default "k" |
| PARABOLIC_SAR         | indicator  | { period:int (100), step:num (0.02), max_step:num (0.2), high?:node, low?:node, close?:node } | SAR price level |
| Z_SCORE               | indicator  | { period:int (20), source?:node }                                        | (value − mean) / stdev over window |
| OBV                   | indicator  | { period:int (20), close?:node, volume?:node }                           | on-balance volume over window |
| HIGHEST               | iterator   | { period:int (14), series?:node }                                        | max of series over window |
| LOWEST                | iterator   | { period:int (14), series?:node }                                        | min |
| SUM                   | iterator   | { period:int (14), series?:node }                                        | sum |
| MEAN                  | iterator   | { period:int (14), series?:node }                                        | mean |
| MEDIAN                | iterator   | { period:int (14), series?:node }                                        | median |
| MODE                  | iterator   | { period:int (14), series?:node }                                        | mode |
| STDEV                 | iterator   | { period:int (14), series?:node }                                        | standard deviation |
| VARIANCE              | iterator   | { period:int (14), series?:node }                                        | variance |
| GET_VARIABLE          | variable   | { name:string }                                                          | reads a runtime variable (numbers/prices cast to float) |
| GET_SERIES            | series     | { name:string }                                                          | reads a named Custom Indicator series at the current offset |
| SECONDS_SINCE         | temporal   | { target: string \| node }                                               | seconds since target time; negative before it |
| SECONDS_UNTIL         | temporal   | { target: string \| node }                                               | seconds until target time; negative after it |
| MINUTES_SINCE         | temporal   | { target: string \| node }                                               | minutes since (same as SECONDS_SINCE ÷ 60) |
| MINUTES_UNTIL         | temporal   | { target: string \| node }                                               | minutes until |
| BARS_SINCE            | temporal   | { target: string \| node }                                               | bars elapsed since target time (capped 500) |
| BARS_UNTIL            | temporal   | { target: string \| node }                                               | −BARS_SINCE(target); does not inspect future bars |
| NOW                   | temporal   | {}                                                                        | current engine time (Unix seconds) |
| GET_ORDER_COUNT       | account    | { symbol?, exchange?, side?, order_type?, status? }                      | count of matching orders |
| GET_POSITION_SIZE     | account    | { symbol?, exchange?, side? }                                             | signed net qty: >0 long, <0 short, 0 flat |
| GET_POSITION_AVG_PRICE| account    | { symbol?, exchange?, side? }                                            | avg fill price of open position |
| GET_POSITION_PNL      | account    | { symbol?, exchange?, side? }                                             | unrealized PnL in quote currency |
| GET_POSITION_PNL_PCT  | account    | { symbol?, exchange?, side? }                                             | unrealized PnL in percentage points (5.0 = +5%) |
| GET_STOP_PRICE        | account    | { symbol?, exchange?, side?, order_type?, status?, sort_by?, nth? }      | stop price of matching order; NaN if none |
| GET_LIMIT_PRICE       | account    | { symbol?, exchange?, side?, order_type?, status?, sort_by?, nth? }      | limit price of matching order; NaN if none |
| VARIABLE_LAST_UPDATED | time       | { name:string }                                                          | Unix ts of last SET_VARIABLE on that variable |
| ORDER_OPEN_TIME       | time       | { symbol?, exchange?, side?, status?, order_type? }                      | created_at Unix ts of newest matching order; NaN if none |
| ORDER_CLOSE_TIME      | time       | { symbol?, exchange?, side?, status?, order_type? }                      | fill/cancel Unix ts of newest closed order; NaN if none |
| POSITION_OPEN_TIME    | time       | { symbol?, exchange?, side? }                                            | Unix ts of the fill that opened the current position; NaN if flat |
| POSITION_CLOSE_TIME   | time       | { symbol?, exchange?, side? }                                            | Unix ts of most recent position close; NaN if none |
| MARKET_OPEN_TIME      | time       | { symbol?, exchange? }                                                   | open of running session, else next open; Polymarket window start; NaN for crypto |
| MARKET_CLOSE_TIME     | time       | { symbol?, exchange? }                                                   | close of running session, else last close; Polymarket endDate; NaN for crypto |
| PRICE_TO_BEAT         | market     | { symbol?, exchange? }                                                   | reference price an up/down prediction market is judged against; NaN before its window opens |
| MARKET_STATUS         | market     | { symbol?, exchange? }                                                   | 1 if the feed reports its market open, 0 closed, NaN unstated (PolyBolt feeds) |
| SECONDS_SINCE_LAST_TICK | market   | { symbol?, exchange? }                                                   | seconds since the instrument's feed last delivered a price |
| LITERAL_TRUE          | literal    | {}                                                                        | 1.0 |
| LITERAL_FALSE         | literal    | {}                                                                        | 0.0 |
| LITERAL_NONE          | literal    | {}                                                                        | NaN (explicit "unset" value) |

## FUNCTION NOTES

Bar primitives (CLOSE_PRICE, OPEN_PRICE, HIGH_PRICE, LOW_PRICE, VOLUME) take arguments: {}
and are offset-sensitive — bar_index picks which bar they read.

Math nodes (ADD, SUBTRACT, MULTIPLY, DIVIDE, ABS) use positional argument arrays and do NOT
take bar_index. They pass no offset to their arguments, so each argument of a root math node is a
root operand itself, with its own bar_index (omitted = last closed bar). Binary math uses `[a, b]`;
ABS uses `[value]`. Use them to build any arithmetic expression.

Multi-output indicators (BOLLINGER, MACD, DONCHIAN, ADX, STOCHASTIC) return one series chosen
by the `output` argument. Defaults: BOLLINGER→"middle", MACD→"macd", DONCHIAN→"middle",
ADX→"adx", STOCHASTIC→"k". BOLLINGER "upper"/"lower" add/subtract `stdev` (default 2) SDs from
the middle SMA. DONCHIAN reads the High/Low series, not Close.

VWAP is a rolling calculation over `period` bars (default 14), not a session-anchored value.
Its `price` and `volume` series default to CLOSE_PRICE and VOLUME.

Iterators (HIGHEST/LOWEST/SUM/MEAN/MEDIAN/MODE/STDEV/VARIANCE) are pure reducers over a
`series` window of length `period`. Without `series` they reduce CLOSE_PRICE. Put the lookback
start on the iterator's `bar_index` (the window's newest bar; default 1); the nested series
stays at 0 unless it intentionally adds offset. `period` may be a plain integer OR a
GET_VARIABLE node. Iterators compose with GET_SERIES, e.g. `{ "function": "MEAN",
"arguments": { "period": 20, "series": { "function": "GET_SERIES", "arguments": { "name":
"spread" } } }, "bar_index": 1 }`. To compare a bar with the window before it, start the
window one bar further back: CLOSE_PRICE[1] > HIGHEST(HIGH_PRICE)[2].

Market session: MARKET_OPEN_TIME / MARKET_CLOSE_TIME take { exchange, symbol } (usually an
InstrumentRef; omitted = the evaluated instrument). Use them as a temporal `target`. Open
returns when the running session opened, or when the next one opens while the market is shut;
close returns when the running session closes, or when the last one closed. US stocks
(NASDAQ/NYSE) are 09:30–16:00 ET Mon–Fri, CME futures 18:00 ET (prior day) → 17:00 ET, OANDA
forex Sun 17:00 → Fri 17:00 ET; holidays and early closes are not modelled. A Polymarket market
returns its window: the start of the period it asks about (eventStartTime) and its endDate. A
PolyBolt reference follows the session of the asset it prices. Crypto venues (Coinbase, Kraken,
PolyBolt crypto) are 24/7 and return NaN.
Example — flatten 5 minutes before the bell: MINUTES_UNTIL(MARKET_CLOSE_TIME) <= 5.

Reference prices: "PolyBolt:<TICKER>" instruments are watch-only oracle prices — the prices
Polymarket's up/down markets resolve on. TICKER is BTCUSD, ETHUSD, SOLUSD, XRPUSD, DOGEUSD,
HYPEUSD, BNBUSD, ZECUSD (add ".TWAP60" for the 60-second TWAP, which the 15-minute up/down
markets resolve on), stocks/ETFs (AAPL, TSLA, NVDA, SPY, QQQ, …), forex (EURUSD, USDJPY, …;
EURUSD.TWAP60, USDJPY.TWAP60), XAUUSD, XAGUSD, and CLL / HN / CC3M commodities. Use them like
any instrument — in conditions, custom indicators, iterators, via InstrumentRef — but NEVER as
the target of SEND_ORDER, MODIFY_ORDER, CANCEL_ORDER or CLOSE_POSITION: such a strategy is
rejected. Put the prediction market you trade in another instrument slot. They carry no volume
(VOLUME, OBV, VWAP return NaN). SET_MARKET may swap a reference slot only for another PolyBolt
symbol.

PRICE_TO_BEAT takes { exchange, symbol } pointing at a Polymarket instrument (usually an
InstrumentRef). Example — buy "Up" when the TWAP is above the price to beat with a minute left:
CLOSE_PRICE on PolyBolt:BTCUSD.TWAP60 > PRICE_TO_BEAT(instrument 0) AND
SECONDS_UNTIL(MARKET_CLOSE_TIME(instrument 0)) < 60. Guard against a stalled feed with
SECONDS_SINCE_LAST_TICK(instrument 1) < 5.

Temporal target: SECONDS_SINCE/SECONDS_UNTIL/MINUTES_SINCE/MINUTES_UNTIL take `target` as
either a time-variable NAME (string, holding an ISO-8601 or "HH:MM" value) OR a node that
resolves to a Unix timestamp (e.g. VARIABLE_LAST_UPDATED, ORDER_OPEN_TIME, POSITION_OPEN_TIME,
MARKET_CLOSE_TIME). BARS_SINCE/BARS_UNTIL accept the same string-or-node target shape.
BARS_UNTIL is the signed inverse of BARS_SINCE; it reports a past event as negative and does
not predict future bars.

Account readers see the agent's whole account, including positions and orders that other
agents placed on it. With empty arguments GET_POSITION_SIZE nets every open position on the
account, so a long in one market and a short in another can cancel to 0. Filter by the
traded instrument — `{ "symbol": { "$ref": "instrument", "index": 0 } }` — whenever the
strategy trades more than one market or may share its account with another agent.

GET_ORDER_COUNT, GET_POSITION_SIZE, GET_POSITION_AVG_PRICE, and GET_POSITION_PNL return 0 when
nothing matches. GET_POSITION_PNL_PCT, order-price readers, and time readers return NaN when
nothing matches. Guard NaN-returning readers with a matching count/position condition before
comparing their result.
Optional filters: `side` "BUY"|"SELL"; `status` "RECEIVED"|"FILLED"|"PARTIAL"|"CANCELED"|"REJECTED"|"PENDING";
`order_type` "MARKET"|"LIMIT"|"STOP"|"STOP_LIMIT". GET_STOP_PRICE and GET_LIMIT_PRICE also
accept `sort_by`: "open_time_desc" (default)|"close_time_desc"|"price_asc"|"price_desc"|
"qty_asc"|"qty_desc"; `nth` is a zero-based index into those sorted matches.

GET_POSITION_SIZE is SIGNED — prefer sign checks for direction: "> 0" long open, "< 0" short
open, "!= 0" any position, "== 0" flat. It also counts market orders already sent but not yet
filled, so a market entry guarded by it does not repeat while the fill is in flight. Position
readers also accept `side` as "BUY"|"LONG" or "SELL"|"SHORT" when a scoped read is needed.

## MARKETS
An instrument symbol is "<Source>:<TICKER>" with no slash in the ticker:

| Source              | Example                                     | Notes |
|---------------------|---------------------------------------------|-------|
| Coinbase            | Coinbase:BTCUSD, Coinbase:ETHUSD            | default crypto source; 24/7 |
| Kraken              | Kraken:ETHUSD                               | crypto; 24/7 |
| NASDAQ / NYSE       | NASDAQ:AAPL, NYSE:SPY                       | US stocks and ETFs |
| CME                 | CME:ESZ26, CME:NQH27                        | futures: root + month letter + 2-digit year |
| OANDA               | OANDA:EURUSD                                | forex |
| Polymarket          | Polymarket:btc-updown-15m-1793291400/Up     | prediction market: `<market slug>/<Outcome>` (the one slash allowed) |
| PolyBolt            | PolyBolt:BTCUSD.TWAP60, PolyBolt:AAPL       | watch-only reference price; never an order target |

Prediction markets trade outcome shares priced between 0 and 1; a share pays $1 if its outcome
wins and $0 if it loses, and sim accounts settle it automatically when the market resolves. A
recurring market's slug ends in its window's start time, so a strategy that keeps trading the
series rolls forward with SET_MARKET "next_in_series" (see ACTION).

## InstrumentRef
Use instead of a hardcoded symbol/exchange string to reference the strategy's instruments:
  { "$ref": "instrument", "index": 0 }   — first instrument in strategy
  { "$ref": "instrument", "index": 1 }   — second instrument, etc.
Valid anywhere a `symbol` or `exchange` field appears (order args, account readers, market
functions, a node's "symbol"). Prefer it over hardcoded symbols: the user can change the
markets at deploy time, and SET_MARKET can swap a slot while the agent runs.

## CONDITION
{
  "leftOperand":  <ExpressionNode or number or string>,
  "operator":     ">" | "<" | "==" | "!=" | ">=" | "<=" | "is_none" | "is_not_none",
  "rightOperand": <ExpressionNode or number or string>
}

"is_none" / "is_not_none" — unary: test whether the left operand resolves to a value.
"is_none" is true when a variable was never set or was cleared; "is_not_none" is the inverse.
rightOperand is ignored — use 0.

## ACTION
Action types (complete list — no others exist):
  SEND_ORDER     — submit an order
  MODIFY_ORDER   — change the price of an existing open order in-place
  CANCEL_ORDER   — cancel matching orders (by orderType, side, or symbol)
  CLOSE_POSITION — close open positions at market
  SET_VARIABLE   — write a named variable
  CLEAR_VARIABLE — delete a variable (resets it to "not set"; is_none becomes true)
  STOP_AGENT     — stop the running agent ("targetId": "self"), or another of the user's agents by id
  START_AGENT    — start (deploy) another of the user's agents, with deploy settings in agentArgs
  SET_MARKET     — replace the market in one instrument slot of the running agent

A rule's actions run in order when it fires.

SEND_ORDER action:
{
  "type": "SEND_ORDER",
  "orderArgs": {
    "action": "BUY" | "SELL",
    "orderType": "MARKET" | "LIMIT" | "STOP" | "STOP_LIMIT",
    "quantity": <number or ExpressionNode>,     // order size in units — see note below
    "amount":   <number or ExpressionNode>,     // OR order size in USD (crypto) — replaces quantity
    "exchange": { "$ref": "instrument", "index": 0 },
    "symbol":   { "$ref": "instrument", "index": 0 },
    "limitPrice": <number or ExpressionNode>,   // LIMIT and STOP_LIMIT only
    "stopPrice":  <number or ExpressionNode>,   // STOP and STOP_LIMIT only
    "timeInForce": "GTC" | "GTD" | "FOK" | "FAK",   // optional, non-MARKET only; default "GTC"
    "expiration": { "afterSeconds": 300 },      // GTD only — or { "at": "<times variable name>" }
                                                //   or { "at": <time ExpressionNode, e.g. MARKET_CLOSE_TIME> }
    "postOnly": true                            // optional; prediction-market LIMIT only
  }
}
Time in force follows Polymarket's order types and applies to every resting order:
  GTC — rests until filled or canceled (the default).
  GTD — rests until filled, canceled or `expiration`; then it expires unfilled.
  FOK — prediction-market LIMIT only: must fill in full against the order book at
        once, or it is rejected.
  FAK — prediction-market LIMIT only: fills what the order book has at the limit
        price or better at once; the rest is canceled.
`postOnly` (prediction-market LIMIT, GTC/GTD) rejects the order instead of letting it
take liquidity. FOK, FAK and postOnly need an order book, so on other markets they
behave as GTC.
Prediction markets have no STOP or STOP_LIMIT orders. A prediction LIMIT price must be
between 0 and 1 and on the market's tick grid (usually 0.01), and its size at least the
market's minimum. A BUY limit that is at or above the best ask fills at once at the ask;
otherwise it rests and fills at its own limit price. A resting BUY holds limit × quantity
of the account's cash until it fills, is canceled or expires; a SELL needs shares the
account holds and no other resting SELL already offers.
Order size: `quantity` is a literal number, or an ExpressionNode — typically
GET_VARIABLE referencing a `numbers` variable, e.g.
  "quantity": { "function": "GET_VARIABLE", "arguments": { "name": "qty" } }
Using a number variable lets the user resize the whole strategy from one place
(including at deploy time). Instruments do NOT carry a quantity. If omitted,
quantity defaults to 1.
Crypto orders are usually sized in USD instead: `"amount": 100` buys (or sells)
$100 worth. Set `amount` or `quantity`, not both; `amount` wins. The units are the
amount divided by the order's limit price (else its stop price, else the market
price). Size an order that closes or reduces a position with `quantity` (e.g.
ABS(GET_POSITION_SIZE)), since a position is counted in units. MODIFY_ORDER accepts
`amount` too.
Every paper order is checked against buying power: an order that would open or add
exposure the account cannot cover is rejected (INSUFFICIENT_BALANCE). Closing orders
are never refused.

CANCEL_ORDER action:
{
  "type": "CANCEL_ORDER",
  "orderArgs": {
    "exchange":  { "$ref": "instrument", "index": 0 },
    "symbol":    { "$ref": "instrument", "index": 0 },
    "orderType": "LIMIT" | "STOP" | "STOP_LIMIT",   // optional filter
    "side":      "BUY" | "SELL"                      // optional filter
  }
}

CLOSE_POSITION action:
{ "type": "CLOSE_POSITION" }
closes every open position on the account at market. Narrow it with optional filters:
{
  "type": "CLOSE_POSITION",
  "orderArgs": {
    "exchange": { "$ref": "instrument", "index": 0 },
    "symbol":   { "$ref": "instrument", "index": 0 },
    "side":     "BUY" | "SELL"                       // optional: BUY = longs, SELL = shorts
  }
}
A close already in flight is not sent twice, so an exit rule that stays true while the
fill lands does not flip the position.

SET_VARIABLE action:
{
  "type": "SET_VARIABLE",
  "targetId": "my_var_key",
  "variableType": "prices" | "times" | "numbers",
  "value": <ExpressionNode or number or string>
}
For a `times` variable, `value` is usually NOW (or another time function); it is stored as
an ISO-8601 time that SECONDS_SINCE and BARS_SINCE read back.

CLEAR_VARIABLE action:
{
  "type": "CLEAR_VARIABLE",
  "targetId": "my_var_key"
}

STOP_AGENT action:
{ "type": "STOP_AGENT", "targetId": "self" }
"self" stops the running agent. Any other targetId must be an id of one of the
user's own agents, which you do not know. Import turns an empty or missing targetId
into "self", so to stop a different agent emit "self" and tell the user to pick the
target agent in the action editor after importing.

START_AGENT action — deploy another of the user's agents, with the same settings as
the Deploy dialog:
{
  "type": "START_AGENT",
  "targetId": "",                       // the user picks the agent in the editor
  "agentArgs": {
    "strategyId": null,                 // null = the agent's current strategy
    "accountId": null,                  // null = the agent's current account
    "instruments": [{ "symbol": "Coinbase:BTCUSD" }],
    "variables": { "prices": {}, "times": {}, "numbers": { "qty": "1" } },
    "maxRuntimeMs": 3600000,            // required unless the plan allows unlimited runtime
    "defaultMaxDrawdown": 0,
    "maxDrawdownPercent": 0,
    "onRiskLimitCancelOrders": true,
    "onRiskLimitClosePositions": true,
    "visibility": "private"
  }
}
The start is checked when the action fires: the target agent must be stopped, and the
user's plan must allow agent orchestration, enough concurrent agents and the runtime.

SET_MARKET action — swap the market traded in one instrument slot:
{
  "type": "SET_MARKET",
  "marketArgs": {
    "index": 0,                         // instrument slot (0-based)
    "mode": "symbol" | "next_in_series",
    "symbol": "Coinbase:ETHUSD"         // mode "symbol" only
  }
}
"next_in_series" moves a prediction market to the next market of its recurring series
(e.g. Polymarket:btc-updown-5m-1792719600/Up → the next 5-minute window, same outcome).
The swap applies after all actions of the rule have run, so CLOSE_POSITION or
CANCEL_ORDER in the same rule still act on the old market. Order actions that use
{ "$ref": "instrument", "index": N } follow the slot to the new market. A slot never
changes between a tradable market and a PolyBolt reference feed.

MODIFY_ORDER action — change the price of an existing open order in-place (on a
prediction market the order is canceled and replaced by a new order with the new
price, keeping its expiry, as the venue has no amend):
{
  "type": "MODIFY_ORDER",
  "orderArgs": {
    "exchange":  { "$ref": "instrument", "index": 0 },
    "symbol":    { "$ref": "instrument", "index": 0 },
    "orderType": "STOP",          // filter: which order(s) to modify
    "side":      "SELL",          // filter: optional side filter
    "stopPrice": <ExpressionNode> // new stop price (or limitPrice for LIMIT orders)
  }
}
Filters (orderType, side, symbol) match the same way as CANCEL_ORDER. All matching RECEIVED
orders are modified. Use orderType + side together to target exactly one leg of a bracket.

## RULE
{
  "label": "Human-readable rule name",
  "condition_groups": [
    { "conditions": [ <Condition>, ... ] },
    { "conditions": [ <Condition>, ... ] }
  ],
  "actions": [ <Action>, ... ]
}

condition_groups — DNF logic (OR across groups, AND within each group):
  - The rule fires if ALL conditions in ANY one group are true simultaneously.
  - A single group behaves identically to a flat AND list.
  - Use multiple groups when you want "scenario A OR scenario B".
  - Every entry must be an object with a "conditions" array. Do not emit a bare array.

## STRATEGY DEFINITION SHAPE
{
  "name": "My Strategy Name",
  "notes": "Optional description",
  "evaluationMode": "TIMED",
  "evaluationIntervalMs": 60000,
  "instruments": [
    { "symbol": "Coinbase:BTCUSD", "barInterval": "1M" }
  ],
  "variables": {
    "prices":   { "support_1": "40000.00" },
    "times":    { "entry_time": "2025-01-01T09:30:00Z" },
    "numbers":  { "tp_multiplier": "2.0" }
  },
  "customIndicators": [
    { "name": "spread", "expression": <ExpressionNode> }
  ],
  "marketRules": [ <Rule>, ... ]
}

Evaluation: always emit "evaluationMode": "TIMED". "evaluationIntervalMs" is the editor's
Evaluation Mode setting; it offers 1000 (every second) and 60000 (every minute). Emit 60000
unless the user asks otherwise. The engine currently runs every rule about once a second and
on each bar close whatever this value is, so design guards for that cadence. ("BAR_CLOSE" is
a legacy alias treated identically to TIMED; "TICK" exists in the schema but is not yet
selectable in the UI — do not emit either.)

Instruments: barInterval values are "1S", "5S", "10S", "15S", "30S", "1M", "2M", "5M",
"15M", "30M", "1H", "2H", "3H", "4H", or "1D". The first instrument is the agent's primary
market; nodes read it unless they name another through "symbol".
Variables: keys match ^[a-z0-9_]+$. prices and numbers use decimal STRINGS (not numbers).
times use ISO-8601 strings or bare "HH:MM" / "HH:MM:SS" times. There is no boolean type:
store a flag as a number ("1"/"0") and compare it with LITERAL_TRUE / LITERAL_FALSE.

`marketRules` is the single rule array — put EVERY rule here (entries, exits, stops, trailing,
order cancels/modifies, variable bookkeeping). All rules are evaluated on every evaluation
cycle, in order. No other top-level rule arrays are supported. Use rule labels (e.g. "Enter…",
"Exit…", "Trail stop…") to convey intent within this single list.

Omit customIndicators (or use []) unless the strategy needs a named reusable series read via
GET_SERIES (e.g. a cross-symbol spread). Each entry is { "name": "<key>", "expression":
<ExpressionNode> }; reference it with GET_SERIES { "name": "<key>" }, and it composes inside
iterators, e.g. MEAN(GET_SERIES("spread")). The expression is evaluated at the bar GET_SERIES
asks for, so its nodes use bar_index 0 (same bar) unless they add lookback.

## PLAN LIMITS
Some primitives need a paid plan. A strategy that uses them still saves, but LiveTape refuses
to deploy an agent running it on a plan without them. Current gates
(https://livetape.ai/pricing is authoritative):
- Futures, forex, prediction markets and PolyBolt reference feeds: Pro and up. Stocks and
  crypto: every plan.
- LIMIT, STOP and STOP_LIMIT orders, and MODIFY_ORDER: Starter and up.
- Sub-minute bar intervals ("1S" … "30S") and reading the open bar (root bar_index 0): Pro and up.
- START_AGENT, and STOP_AGENT aimed at another agent: Pro and up.
- Rules per strategy, condition groups, instruments per agent and runtime are capped per plan.
When the user's plan is unknown and nothing in the request needs these, prefer MARKET orders,
minute-or-longer intervals and closed bars.

## IMPORT
The user pastes the JSON into the strategy editor's Source tab and presses Import, which
replaces the open strategy's name, notes, markets, variables, custom indicators and rules.
Import refuses: invalid JSON, a strategy or rule "id" field (LiveTape assigns IDs), a rule
without "label", "condition_groups" or "actions", an operand object without "function", an
unknown action type, a symbol not in "Source:TICKER" form, and any order action aimed at a
PolyBolt reference feed. START_AGENT / STOP_AGENT targets that are not the user's own agents
are cleared.
