# LiveTape strategy examples: entry signals

Crossovers, candle shape, OR logic, VWAP distance, breakouts, multiple timeframes and cross-symbol series.

Examples are teaching artifacts, not production strategies:
- FOCUSED MECHANIC — isolates one wire-format or execution mechanic.
- COMPOSITION PATTERN — combines a few primitives into a reusable trader workflow.
- MULTI-RULE COMPOSITION — shows state or order lifecycle flowing across several rules.

Select the primitives the user's request needs and compose them; add the entry, exit, sizing,
risk, reset and duplicate-order guards the example leaves out. The schema itself is in
[strategy-schema.md](strategy-schema.md).

## FOCUSED MECHANIC — BAR-OFFSET CROSSOVER
A cross is a comparison that holds on the last closed bar ([1]) and did not hold on the bar
before it ([2]). The order is sized in USD, the default for crypto.

{
  "name": "SMA Crossover",
  "notes": "Buy $100 of BTC when the 20 SMA crosses above the 50 SMA; close when it crosses below.",
  "evaluationMode": "TIMED",
  "evaluationIntervalMs": 60000,
  "instruments": [
    { "symbol": "Coinbase:BTCUSD", "barInterval": "1H" }
  ],
  "variables": { "prices": {}, "times": {}, "numbers": { "order_usd": "100" } },
  "marketRules": [
    {
      "label": "Buy Signal",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand":  { "function": "SMA", "arguments": { "period": 20 }, "bar_index": 1 },
              "operator": ">",
              "rightOperand": { "function": "SMA", "arguments": { "period": 50 }, "bar_index": 1 }
            },
            {
              "leftOperand":  { "function": "SMA", "arguments": { "period": 20 }, "bar_index": 2 },
              "operator": "<=",
              "rightOperand": { "function": "SMA", "arguments": { "period": 50 }, "bar_index": 2 }
            },
            {
              "leftOperand":  { "function": "GET_POSITION_SIZE", "arguments": { "symbol": { "$ref": "instrument", "index": 0 } } },
              "operator": "==",
              "rightOperand": 0
            }
          ]
        }
      ],
      "actions": [
        {
          "type": "SEND_ORDER",
          "orderArgs": {
            "action": "BUY",
            "orderType": "MARKET",
            "exchange": { "$ref": "instrument", "index": 0 },
            "symbol":   { "$ref": "instrument", "index": 0 },
            "amount":   { "function": "GET_VARIABLE", "arguments": { "name": "order_usd" } }
          }
        }
      ]
    },
    {
      "label": "Sell Signal",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand":  { "function": "SMA", "arguments": { "period": 20 }, "bar_index": 1 },
              "operator": "<",
              "rightOperand": { "function": "SMA", "arguments": { "period": 50 }, "bar_index": 1 }
            },
            {
              "leftOperand":  { "function": "SMA", "arguments": { "period": 20 }, "bar_index": 2 },
              "operator": ">=",
              "rightOperand": { "function": "SMA", "arguments": { "period": 50 }, "bar_index": 2 }
            },
            {
              "leftOperand":  { "function": "GET_POSITION_SIZE", "arguments": { "symbol": { "$ref": "instrument", "index": 0 } } },
              "operator": "!=",
              "rightOperand": 0
            }
          ]
        }
      ],
      "actions": [
        {
          "type": "CLOSE_POSITION",
          "orderArgs": {
            "exchange": { "$ref": "instrument", "index": 0 },
            "symbol":   { "$ref": "instrument", "index": 0 }
          }
        }
      ]
    }
  ]
}

Key points:
- The [1]/[2] pair makes the rule fire on the bar the cross happens, not on every bar the fast average stays above.
- "amount" sizes the order in USD; the engine converts it to BTC at the market price. CLOSE_POSITION needs no size.
- Filtering GET_POSITION_SIZE and CLOSE_POSITION by instrument 0 keeps the rules to this market when the account holds others.

## FOCUSED MECHANIC — VOLATILITY-NORMALIZED CANDLE BODY
Detect a bullish candle whose real body is large relative to current ATR. This teaches
nested arithmetic without tying the threshold to one instrument's price scale.

{
  "name": "Large Bullish Candle Filter",
  "notes": "Entry-side teaching artifact only: require a bullish candle body of at least 1.5 ATR.",
  "evaluationMode": "TIMED",
  "evaluationIntervalMs": 60000,
  "instruments": [
    { "symbol": "Coinbase:BTCUSD", "barInterval": "5M" }
  ],
  "variables": {
    "prices": {},
    "times":  {},
    "numbers": { "body_atr_multiple": "1.5", "qty": "0.01" }
  },
  "marketRules": [
    {
      "label": "Large bullish candle",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand": {
                "function": "ABS",
                "arguments": [
                  {
                    "function": "SUBTRACT",
                    "arguments": [
                      { "function": "CLOSE_PRICE", "arguments": {}, "bar_index": 1 },
                      { "function": "OPEN_PRICE", "arguments": {}, "bar_index": 1 }
                    ]
                  }
                ]
              },
              "operator": ">=",
              "rightOperand": {
                "function": "MULTIPLY",
                "arguments": [
                  { "function": "ATR", "arguments": { "period": 14 }, "bar_index": 1 },
                  { "function": "GET_VARIABLE", "arguments": { "name": "body_atr_multiple" } }
                ]
              }
            },
            {
              "leftOperand":  { "function": "CLOSE_PRICE", "arguments": {}, "bar_index": 1 },
              "operator": ">",
              "rightOperand": { "function": "OPEN_PRICE", "arguments": {}, "bar_index": 1 }
            },
            {
              "leftOperand":  { "function": "GET_POSITION_SIZE", "arguments": {} },
              "operator": "==",
              "rightOperand": 0
            }
          ]
        }
      ],
      "actions": [
        {
          "type": "SEND_ORDER",
          "orderArgs": {
            "action": "BUY",
            "orderType": "MARKET",
            "exchange": { "$ref": "instrument", "index": 0 },
            "symbol":   { "$ref": "instrument", "index": 0 },
            "quantity": { "function": "GET_VARIABLE", "arguments": { "name": "qty" } }
          }
        }
      ]
    }
  ]
}

Key points:
- ABS(SUBTRACT(close, open)) measures body size regardless of direction; the second condition supplies bullish direction.
- Comparing that body with MULTIPLY(ATR, a variable) makes the threshold portable across volatility regimes.
- Math nodes are transparent: CLOSE_PRICE, OPEN_PRICE and ATR inside them are root operands, so each takes bar_index 1 (the last closed bar). bar_index 0 would read the still-forming bar, which needs the Pro plan.

## FOCUSED MECHANIC — CONDITION GROUPS (OR LOGIC)
Enter long if RSI is oversold OR price is below the lower Bollinger Band — either signal is
sufficient. Use two condition_groups for OR; each group is an independent AND clause.

{
  "name": "RSI or Bollinger Entry",
  "evaluationMode": "TIMED",
  "evaluationIntervalMs": 60000,
  "instruments": [
    { "symbol": "Coinbase:BTCUSD", "barInterval": "1H" }
  ],
  "variables": { "prices": {}, "times": {}, "numbers": {} },
  "marketRules": [
    {
      "label": "Enter long — RSI oversold OR below lower BB",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand":  { "function": "RSI", "arguments": { "period": 14 }, "bar_index": 1 },
              "operator": "<",
              "rightOperand": 30
            },
            {
              "leftOperand":  { "function": "GET_POSITION_SIZE", "arguments": {} },
              "operator": "==",
              "rightOperand": 0
            }
          ]
        },
        {
          "conditions": [
            {
              "leftOperand":  { "function": "CLOSE_PRICE", "arguments": {}, "bar_index": 1 },
              "operator": "<",
              "rightOperand": { "function": "BOLLINGER", "arguments": { "period": 20, "stdev": 2, "output": "lower" }, "bar_index": 1 }
            },
            {
              "leftOperand":  { "function": "GET_POSITION_SIZE", "arguments": {} },
              "operator": "==",
              "rightOperand": 0
            }
          ]
        }
      ],
      "actions": [
        {
          "type": "SEND_ORDER",
          "orderArgs": {
            "action": "BUY",
            "orderType": "MARKET",
            "exchange": { "$ref": "instrument", "index": 0 },
            "symbol":   { "$ref": "instrument", "index": 0 }
          }
        }
      ]
    }
  ]
}

Key points:
- Rules use condition_groups (array of groups), NOT a flat "conditions" array.
- The rule fires if ALL conditions in group[0] are true, OR ALL conditions in group[1] are true.
- Shared guard conditions (like "no open position") must be repeated in every group that needs them.

## FOCUSED MECHANIC — VWAP WITH A DISTANCE THRESHOLD
VWAP defaults to CLOSE_PRICE weighted by VOLUME over 14 bars. Compare price against it directly,
or use SUBTRACT to measure distance. Pass `price` or `volume` to select another source series.

{
  "name": "VWAP Distance Entry",
  "evaluationMode": "TIMED",
  "evaluationIntervalMs": 60000,
  "instruments": [
    { "symbol": "Coinbase:BTCUSD", "barInterval": "1M" }
  ],
  "variables": { "prices": {}, "times": {}, "numbers": { "distance": "200" } },
  "marketRules": [
    {
      "label": "Enter long — price below VWAP by distance",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand": {
                "function": "SUBTRACT",
                "arguments": [
                  { "function": "VWAP", "arguments": { "period": 14 }, "bar_index": 1 },
                  { "function": "CLOSE_PRICE", "arguments": {}, "bar_index": 1 }
                ]
              },
              "operator": ">=",
              "rightOperand": { "function": "GET_VARIABLE", "arguments": { "name": "distance" } }
            },
            {
              "leftOperand":  { "function": "GET_POSITION_SIZE", "arguments": {} },
              "operator": "==",
              "rightOperand": 0
            }
          ]
        }
      ],
      "actions": [
        {
          "type": "SEND_ORDER",
          "orderArgs": {
            "action": "BUY",
            "orderType": "MARKET",
            "exchange": { "$ref": "instrument", "index": 0 },
            "symbol":   { "$ref": "instrument", "index": 0 }
          }
        }
      ]
    }
  ]
}

Key points:
- To measure distance: SUBTRACT(VWAP, CLOSE_PRICE) for "how far below VWAP"; SUBTRACT(CLOSE_PRICE, VWAP) for "how far above".

## COMPOSITION PATTERN — VOLUME-CONFIRMED ROLLING BREAKOUT
Confirm a price breakout with relative volume. The breakout bar is the last closed bar ([1]);
HIGHEST and MEAN start their windows one bar earlier ([2]), so the breakout bar is not part of
its own baseline.

{
  "name": "Volume-Confirmed Rolling Breakout",
  "evaluationMode": "TIMED",
  "evaluationIntervalMs": 60000,
  "instruments": [
    { "symbol": "Coinbase:BTCUSD", "barInterval": "1M" }
  ],
  "variables": {
    "prices": {},
    "times": {},
    "numbers": { "lookback": "20", "buffer": "50", "volume_multiple": "1.5" }
  },
  "marketRules": [
    {
      "label": "Enter long — close breaks above 20-bar high",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand": {
                "function": "SUBTRACT",
                "arguments": [
                  { "function": "CLOSE_PRICE", "arguments": {}, "bar_index": 1 },
                  {
                    "function": "HIGHEST",
                    "arguments": {
                      "series": { "function": "HIGH_PRICE", "arguments": {}, "bar_index": 0 },
                      "period": { "function": "GET_VARIABLE", "arguments": { "name": "lookback" } }
                    },
                    "bar_index": 2
                  }
                ]
              },
              "operator": ">=",
              "rightOperand": { "function": "GET_VARIABLE", "arguments": { "name": "buffer" } }
            },
            {
              "leftOperand": { "function": "VOLUME", "arguments": {}, "bar_index": 1 },
              "operator": ">=",
              "rightOperand": {
                "function": "MULTIPLY",
                "arguments": [
                  {
                    "function": "MEAN",
                    "arguments": {
                      "series": { "function": "VOLUME", "arguments": {}, "bar_index": 0 },
                      "period": { "function": "GET_VARIABLE", "arguments": { "name": "lookback" } }
                    },
                    "bar_index": 2
                  },
                  { "function": "GET_VARIABLE", "arguments": { "name": "volume_multiple" } }
                ]
              }
            },
            {
              "leftOperand":  { "function": "GET_POSITION_SIZE", "arguments": {} },
              "operator": "==",
              "rightOperand": 0
            }
          ]
        }
      ],
      "actions": [
        {
          "type": "SEND_ORDER",
          "orderArgs": {
            "action": "BUY",
            "orderType": "MARKET",
            "exchange": { "$ref": "instrument", "index": 0 },
            "symbol":   { "$ref": "instrument", "index": 0 }
          }
        }
      ]
    }
  ]
}

Key points:
- HIGHEST over HIGH_PRICE creates the resistance baseline; MEAN over VOLUME creates the participation baseline.
- Each argument of the root SUBTRACT is a root operand: CLOSE_PRICE[1] is the breakout bar and HIGHEST[2] covers the bars before it. A window ending at [1] would include the breakout bar, whose close can never exceed its own high. The series inside an iterator stays at [0], relative to the window.
- A GET_VARIABLE node may supply the period, so one lookback parameter drives both windows.

## COMPOSITION PATTERN — MULTI-TIMEFRAME TREND CONFIRMATION
Require a fast-timeframe signal to agree with a slower trend before entering. Each
market-data node selects its own interval; the rule still evaluates as one condition group.

{
  "name": "Multi-Timeframe Trend Confirmation",
  "evaluationMode": "TIMED",
  "evaluationIntervalMs": 60000,
  "instruments": [
    { "symbol": "Coinbase:BTCUSD", "barInterval": "5M" }
  ],
  "variables": {
    "prices": {},
    "times":  {},
    "numbers": { "qty": "0.01" }
  },
  "marketRules": [
    {
      "label": "Enter when 5M momentum agrees with 1H trend",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand":  { "function": "EMA", "arguments": { "period": 20 }, "bar_index": 1, "bar_interval": "5M" },
              "operator": ">",
              "rightOperand": { "function": "EMA", "arguments": { "period": 50 }, "bar_index": 1, "bar_interval": "5M" }
            },
            {
              "leftOperand":  { "function": "CLOSE_PRICE", "arguments": {}, "bar_index": 1, "bar_interval": "1H" },
              "operator": ">",
              "rightOperand": { "function": "SMA", "arguments": { "period": 200 }, "bar_index": 1, "bar_interval": "1H" }
            },
            {
              "leftOperand":  { "function": "GET_POSITION_SIZE", "arguments": {} },
              "operator": "==",
              "rightOperand": 0
            }
          ]
        }
      ],
      "actions": [
        {
          "type": "SEND_ORDER",
          "orderArgs": {
            "action": "BUY",
            "orderType": "MARKET",
            "exchange": { "$ref": "instrument", "index": 0 },
            "symbol":   { "$ref": "instrument", "index": 0 },
            "quantity": { "function": "GET_VARIABLE", "arguments": { "name": "qty" } }
          }
        }
      ]
    }
  ]
}

Key points:
- `bar_interval` belongs to each market-data node, so 5M and 1H values can be compared in the same rule.
- `bar_index: 1` means the most recently closed bar in that node's selected interval.
- This shows entry confirmation only; compose separate exit and risk rules for the intended holding period.

## COMPOSITION PATTERN — CROSS-SYMBOL CUSTOM SERIES
Define a reusable per-bar price ratio, normalize it with Z_SCORE, and act on two instruments.
This demonstrates composition across Custom Indicators, GET_SERIES, an indicator source,
instrument references, and coordinated actions.

{
  "name": "Cross-Symbol Ratio Entry",
  "notes": "Open opposing legs when the normalized price ratio is unusually high. Add independent exit, rebalance, and risk rules before deployment.",
  "evaluationMode": "TIMED",
  "evaluationIntervalMs": 60000,
  "instruments": [
    { "symbol": "Coinbase:BTCUSD", "barInterval": "5M" },
    { "symbol": "Coinbase:ETHUSD", "barInterval": "5M" }
  ],
  "variables": {
    "prices": {},
    "times":  {},
    "numbers": { "entry_z": "2", "btc_qty": "0.01", "eth_qty": "0.1" }
  },
  "customIndicators": [
    {
      "name": "price_ratio",
      "expression": {
        "function": "DIVIDE",
        "arguments": [
          { "function": "CLOSE_PRICE", "arguments": {}, "bar_index": 0, "symbol": { "$ref": "instrument", "index": 0 } },
          { "function": "CLOSE_PRICE", "arguments": {}, "bar_index": 0, "symbol": { "$ref": "instrument", "index": 1 } }
        ]
      }
    }
  ],
  "marketRules": [
    {
      "label": "Open opposing legs on a high ratio z-score",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand": {
                "function": "Z_SCORE",
                "arguments": {
                  "period": 20,
                  "source": { "function": "GET_SERIES", "arguments": { "name": "price_ratio" }, "bar_index": 0 }
                },
                "bar_index": 1
              },
              "operator": ">=",
              "rightOperand": { "function": "GET_VARIABLE", "arguments": { "name": "entry_z" } }
            },
            {
              "leftOperand":  { "function": "GET_POSITION_SIZE", "arguments": { "symbol": { "$ref": "instrument", "index": 0 } } },
              "operator": "==",
              "rightOperand": 0
            },
            {
              "leftOperand":  { "function": "GET_POSITION_SIZE", "arguments": { "symbol": { "$ref": "instrument", "index": 1 } } },
              "operator": "==",
              "rightOperand": 0
            }
          ]
        }
      ],
      "actions": [
        {
          "type": "SEND_ORDER",
          "orderArgs": {
            "action": "SELL",
            "orderType": "MARKET",
            "exchange": { "$ref": "instrument", "index": 0 },
            "symbol":   { "$ref": "instrument", "index": 0 },
            "quantity": { "function": "GET_VARIABLE", "arguments": { "name": "btc_qty" } }
          }
        },
        {
          "type": "SEND_ORDER",
          "orderArgs": {
            "action": "BUY",
            "orderType": "MARKET",
            "exchange": { "$ref": "instrument", "index": 1 },
            "symbol":   { "$ref": "instrument", "index": 1 },
            "quantity": { "function": "GET_VARIABLE", "arguments": { "name": "eth_qty" } }
          }
        }
      ]
    }
  ]
}

Key points:
- A Custom Indicator stores an expression, not a cached value; GET_SERIES re-evaluates it at each requested bar offset.
- Passing GET_SERIES as Z_SCORE's source turns the cross-symbol expression into a rolling normalized signal.
- Multiple actions coordinate the legs, but they are not atomic; production rules still need partial-fill, exit, rebalance, and risk handling.
- A price ratio makes differently scaled instruments comparable, but real pair selection and hedge sizing still require statistical validation.
