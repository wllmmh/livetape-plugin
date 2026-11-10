# LiveTape strategy examples: orders and exits

Position sizing, stop losses, limit entries, brackets, profit exits and stale-order cleanup.

Examples are teaching artifacts, not production strategies:
- FOCUSED MECHANIC — isolates one wire-format or execution mechanic.
- COMPOSITION PATTERN — combines a few primitives into a reusable trader workflow.
- MULTI-RULE COMPOSITION — shows state or order lifecycle flowing across several rules.

Select the primitives the user's request needs and compose them; add the entry, exit, sizing,
risk, reset and duplicate-order guards the example leaves out. The schema itself is in
[strategy-schema.md](strategy-schema.md).

## FOCUSED MECHANIC — VARIABLE POSITION SIZING
Variables declared in the strategy config are readable at runtime via GET_VARIABLE.
This lets users adjust parameters without editing rules.

{
  "name": "Variable Position Size",
  "notes": "Only enter if RSI < 35 and no open position. Size comes from a user variable.",
  "evaluationMode": "TIMED",
  "evaluationIntervalMs": 60000,
  "instruments": [
    { "symbol": "Coinbase:BTCUSD", "barInterval": "1H" }
  ],
  "variables": {
    "prices":   {},
    "times":    {},
    "numbers":  { "position_size": "0.05", "allow_entry": "1" }
  },
  "marketRules": [
    {
      "label": "Conditional Entry",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand":  { "function": "GET_VARIABLE", "arguments": { "name": "allow_entry" } },
              "operator": "==",
              "rightOperand": 1
            },
            {
              "leftOperand":  { "function": "RSI", "arguments": { "period": 14 }, "bar_index": 1 },
              "operator": "<",
              "rightOperand": 35
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
            "quantity": { "function": "GET_VARIABLE", "arguments": { "name": "position_size" } }
          }
        }
      ]
    }
  ]
}

Key points:
- GET_VARIABLE reads from the variables declared in the strategy config.
- Feature flags are stored as numbers ("1"/"0") since there is no boolean variable type; compare with == 1 or == 0.
- GET_POSITION_SIZE with empty arguments nets every open position on the account, other agents' included; filter by instrument when that matters.

## MULTI-RULE COMPOSITION — STORED-PRICE STOP LOSS

{
  "name": "Hard Stop Loss",
  "notes": "Close the position if price falls more than 3% below a reference price stored in a variable.",
  "evaluationMode": "TIMED",
  "evaluationIntervalMs": 60000,
  "instruments": [
    { "symbol": "Coinbase:BTCUSD", "barInterval": "1M" }
  ],
  "variables": {
    "prices":   { "entry_price": "0" },
    "times":    {},
    "numbers":  { "stop_pct": "0.03" }
  },
  "marketRules": [
    {
      "label": "Entry — stamp entry price",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand":  { "function": "SMA", "arguments": { "period": 10 }, "bar_index": 1 },
              "operator": ">",
              "rightOperand": { "function": "SMA", "arguments": { "period": 30 }, "bar_index": 1 }
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
            "quantity": 0.01
          }
        },
        {
          "type": "SET_VARIABLE",
          "targetId": "entry_price",
          "variableType": "prices",
          "value": { "function": "CLOSE_PRICE", "arguments": {}, "bar_index": 1 }
        }
      ]
    },
    {
      "label": "Hard Stop Loss",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand":  { "function": "GET_POSITION_SIZE", "arguments": {} },
              "operator": ">",
              "rightOperand": 0
            },
            {
              "leftOperand": { "function": "CLOSE_PRICE", "arguments": {}, "bar_index": 1 },
              "operator": "<",
              "rightOperand": {
                "function": "MULTIPLY",
                "arguments": [
                  { "function": "GET_VARIABLE", "arguments": { "name": "entry_price" } },
                  {
                    "function": "SUBTRACT",
                    "arguments": [
                      1,
                      { "function": "GET_VARIABLE", "arguments": { "name": "stop_pct" } }
                    ]
                  }
                ]
              }
            }
          ]
        }
      ],
      "actions": [
        { "type": "CLOSE_POSITION" }
      ]
    }
  ]
}

Key points:
- Math nodes (MULTIPLY, SUBTRACT, ADD, DIVIDE) wrap other nodes — they do not take bar_index.
- Numbers stored as strings in variables ("0.03") are automatically cast to float at runtime.
- Rules that manage positions are evaluated on every evaluation cycle like every other rule.

## MULTI-RULE COMPOSITION — LIMIT ENTRY + PROTECTIVE STOP
Enter with a limit order below the current price. Once filled, place a stop order as a hard
stop loss. Cancel both bracket orders if the position is closed.

{
  "name": "Limit Entry with Stop Loss",
  "notes": "Buy limit 1 ATR below market; stop loss 2 ATR below entry.",
  "evaluationMode": "TIMED",
  "evaluationIntervalMs": 60000,
  "instruments": [
    { "symbol": "Coinbase:BTCUSD", "barInterval": "1M" }
  ],
  "variables": { "prices": {}, "times": {}, "numbers": {} },
  "marketRules": [
    {
      "label": "Place limit buy",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand":  { "function": "RSI", "arguments": { "period": 14 }, "bar_index": 1 },
              "operator": "<",
              "rightOperand": 40
            },
            {
              "leftOperand":  { "function": "GET_POSITION_SIZE", "arguments": {} },
              "operator": "==",
              "rightOperand": 0
            },
            {
              "leftOperand":  { "function": "GET_ORDER_COUNT", "arguments": { "side": "BUY", "status": "RECEIVED" } },
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
            "orderType": "LIMIT",
            "exchange": { "$ref": "instrument", "index": 0 },
            "symbol":   { "$ref": "instrument", "index": 0 },
            "limitPrice": {
              "function": "SUBTRACT",
              "arguments": [
                { "function": "CLOSE_PRICE", "arguments": {}, "bar_index": 1 },
                { "function": "ATR", "arguments": { "period": 14 }, "bar_index": 1 }
              ]
            }
          }
        }
      ]
    },
    {
      "label": "Place stop loss once in position",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand":  { "function": "GET_POSITION_SIZE", "arguments": {} },
              "operator": ">",
              "rightOperand": 0
            },
            {
              "leftOperand":  { "function": "GET_ORDER_COUNT", "arguments": { "side": "SELL", "status": "RECEIVED" } },
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
            "orderType": "STOP",
            "exchange": { "$ref": "instrument", "index": 0 },
            "symbol":   { "$ref": "instrument", "index": 0 },
            "stopPrice": {
              "function": "SUBTRACT",
              "arguments": [
                { "function": "GET_POSITION_AVG_PRICE", "arguments": {} },
                {
                  "function": "MULTIPLY",
                  "arguments": [
                    2,
                    { "function": "ATR", "arguments": { "period": 14 }, "bar_index": 1 }
                  ]
                }
              ]
            }
          }
        }
      ]
    }
  ]
}

Key points:
- LIMIT orders use "limitPrice"; STOP orders use "stopPrice". Neither field is needed for MARKET.
- GET_POSITION_AVG_PRICE returns the average fill price of the open position — use it to anchor stop/target levels dynamically.
- GET_ORDER_COUNT with status "RECEIVED" counts pending (unfilled) orders. Use it to avoid placing duplicate bracket orders on every bar.

## MULTI-RULE COMPOSITION — BRACKET + PROFIT-LOCK STOP
Place a take-profit limit and protective stop after entry, then modify the stop when
price approaches the target. The rules share stored prices and live order state.

{
  "name": "Bracket with Profit-Lock Stop",
  "notes": "Enter long on EMA cross. Place LIMIT take-profit + STOP loss. Store both prices. When close moves within lock_in_threshold of the limit, move the stop forward once to entry_price + lock_in_distance.",
  "evaluationMode": "TIMED",
  "evaluationIntervalMs": 60000,
  "instruments": [
    { "symbol": "Coinbase:BTCUSD", "barInterval": "1M" }
  ],
  "variables": {
    "prices":  { "entry_price": "", "limit_price": "" },
    "times":   {},
    "numbers": { "take_profit_distance": "600", "stop_loss_distance": "400", "lock_in_threshold": "200", "lock_in_distance": "150" }
  },
  "marketRules": [
    {
      "label": "Enter long — EMA cross up",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand":  { "function": "EMA", "arguments": { "period": 20 }, "bar_index": 1 },
              "operator": ">",
              "rightOperand": { "function": "EMA", "arguments": { "period": 50 }, "bar_index": 1 }
            },
            {
              "leftOperand":  { "function": "EMA", "arguments": { "period": 20 }, "bar_index": 2 },
              "operator": "<=",
              "rightOperand": { "function": "EMA", "arguments": { "period": 50 }, "bar_index": 2 }
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
            "action": "BUY", "orderType": "MARKET",
            "exchange": { "$ref": "instrument", "index": 0 },
            "symbol":   { "$ref": "instrument", "index": 0 }
          }
        },
        {
          "type": "SET_VARIABLE",
          "targetId": "entry_price", "variableType": "prices",
          "value": { "function": "CLOSE_PRICE", "arguments": {}, "bar_index": 1 }
        }
      ]
    },
    {
      "label": "Place bracket once in position",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand":  { "function": "GET_POSITION_SIZE", "arguments": {} },
              "operator": ">",
              "rightOperand": 0
            },
            {
              "leftOperand":  { "function": "GET_ORDER_COUNT", "arguments": { "side": "SELL", "status": "RECEIVED" } },
              "operator": "==",
              "rightOperand": 0
            },
            {
              "leftOperand":  { "function": "GET_VARIABLE", "arguments": { "name": "entry_price" } },
              "operator": "is_not_none",
              "rightOperand": 0
            }
          ]
        }
      ],
      "actions": [
        {
          "type": "SEND_ORDER",
          "orderArgs": {
            "action": "SELL", "orderType": "LIMIT",
            "exchange": { "$ref": "instrument", "index": 0 },
            "symbol":   { "$ref": "instrument", "index": 0 },
            "limitPrice": {
              "function": "ADD",
              "arguments": [
                { "function": "GET_VARIABLE", "arguments": { "name": "entry_price" } },
                { "function": "GET_VARIABLE", "arguments": { "name": "take_profit_distance" } }
              ]
            }
          }
        },
        {
          "type": "SEND_ORDER",
          "orderArgs": {
            "action": "SELL", "orderType": "STOP",
            "exchange": { "$ref": "instrument", "index": 0 },
            "symbol":   { "$ref": "instrument", "index": 0 },
            "stopPrice": {
              "function": "SUBTRACT",
              "arguments": [
                { "function": "GET_VARIABLE", "arguments": { "name": "entry_price" } },
                { "function": "GET_VARIABLE", "arguments": { "name": "stop_loss_distance" } }
              ]
            }
          }
        },
        {
          "type": "SET_VARIABLE",
          "targetId": "limit_price", "variableType": "prices",
          "value": {
            "function": "ADD",
            "arguments": [
              { "function": "GET_VARIABLE", "arguments": { "name": "entry_price" } },
              { "function": "GET_VARIABLE", "arguments": { "name": "take_profit_distance" } }
            ]
          }
        }
      ]
    },
    {
      "label": "Cancel bracket when flat",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand":  { "function": "GET_POSITION_SIZE", "arguments": {} },
              "operator": "==",
              "rightOperand": 0
            },
            {
              "leftOperand":  { "function": "GET_ORDER_COUNT", "arguments": { "status": "RECEIVED" } },
              "operator": ">=",
              "rightOperand": 1
            }
          ]
        }
      ],
      "actions": [
        { "type": "CANCEL_ORDER", "orderArgs": { "exchange": { "$ref": "instrument", "index": 0 }, "symbol": { "$ref": "instrument", "index": 0 }, "orderType": "LIMIT" } },
        { "type": "CANCEL_ORDER", "orderArgs": { "exchange": { "$ref": "instrument", "index": 0 }, "symbol": { "$ref": "instrument", "index": 0 }, "orderType": "STOP" } },
        { "type": "CLEAR_VARIABLE", "targetId": "entry_price" },
        { "type": "CLEAR_VARIABLE", "targetId": "limit_price" }
      ]
    },
    {
      "label": "Move stop to lock in profit when close approaches limit",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand":  { "function": "GET_POSITION_SIZE", "arguments": {} },
              "operator": ">",
              "rightOperand": 0
            },
            {
              "leftOperand":  { "function": "GET_VARIABLE", "arguments": { "name": "limit_price" } },
              "operator": "is_not_none",
              "rightOperand": 0
            },
            {
              "leftOperand":  { "function": "GET_ORDER_COUNT", "arguments": { "side": "SELL", "order_type": "STOP", "status": "RECEIVED" } },
              "operator": ">",
              "rightOperand": 0
            },
            {
              "leftOperand": {
                "function": "SUBTRACT",
                "arguments": [
                  { "function": "GET_VARIABLE", "arguments": { "name": "limit_price" } },
                  { "function": "CLOSE_PRICE", "arguments": {}, "bar_index": 1 }
                ]
              },
              "operator": "<=",
              "rightOperand": { "function": "GET_VARIABLE", "arguments": { "name": "lock_in_threshold" } }
            },
            {
              "leftOperand":  { "function": "GET_STOP_PRICE", "arguments": { "side": "SELL", "order_type": "STOP", "status": "RECEIVED" } },
              "operator": "<",
              "rightOperand": {
                "function": "ADD",
                "arguments": [
                  { "function": "GET_VARIABLE", "arguments": { "name": "entry_price" } },
                  { "function": "GET_VARIABLE", "arguments": { "name": "lock_in_distance" } }
                ]
              }
            }
          ]
        }
      ],
      "actions": [
        {
          "type": "MODIFY_ORDER",
          "orderArgs": {
            "exchange":  { "$ref": "instrument", "index": 0 },
            "symbol":    { "$ref": "instrument", "index": 0 },
            "side":      "SELL",
            "orderType": "STOP",
            "stopPrice": {
              "function": "ADD",
              "arguments": [
                { "function": "GET_VARIABLE", "arguments": { "name": "entry_price" } },
                { "function": "GET_VARIABLE", "arguments": { "name": "lock_in_distance" } }
              ]
            }
          }
        }
      ]
    }
  ]
}

Key points:
- MODIFY_ORDER uses the same orderType + side filters as CANCEL_ORDER to target which orders to modify.
- Use "stopPrice" to update a STOP order's trigger price; use "limitPrice" to update a LIMIT order's price.
- Store the intended limit price for stable reuse; GET_LIMIT_PRICE can read the current live order price when that is the desired reference.
- Guard GET_STOP_PRICE with GET_ORDER_COUNT because an unmatched price read returns NaN.
- Comparing the live stop with the proposed stop prevents repeated modifications and keeps the stop one-way for a long position.

## FOCUSED MECHANIC — PERCENTAGE PNL EXIT
Close the position when unrealized PnL exceeds a target, without storing entry price in a variable.
GET_POSITION_PNL_PCT normalizes the threshold across position sizes and instruments.

{
  "name": "Percentage PnL Take-Profit",
  "notes": "Close when unrealized PnL reaches profit_target_pct percentage points.",
  "evaluationMode": "TIMED",
  "evaluationIntervalMs": 60000,
  "instruments": [
    { "symbol": "Coinbase:BTCUSD", "barInterval": "1M" }
  ],
  "variables": { "prices": {}, "times": {}, "numbers": { "profit_target_pct": "5" } },
  "marketRules": [
    {
      "label": "Close when profit target hit",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand":  { "function": "GET_POSITION_PNL_PCT", "arguments": {} },
              "operator": ">=",
              "rightOperand": { "function": "GET_VARIABLE", "arguments": { "name": "profit_target_pct" } }
            }
          ]
        }
      ],
      "actions": [
        { "type": "CLOSE_POSITION" }
      ]
    }
  ]
}

Key points:
- GET_POSITION_PNL_PCT returns percentage points: 5.0 means +5%, not 0.05.
- Optional symbol, exchange, and side filters narrow the position set; empty {} reads every position on the account.
- Use GET_POSITION_PNL instead when the threshold should be a fixed quote-currency amount.

## COMPOSITION PATTERN — CANCEL A STALE ORDER
These TimeFunction nodes return Unix timestamps. Pass them as the target of SECONDS_SINCE
to measure how long an order has been open or how long you've been in a position.

Cancel a limit order that has been sitting unfilled for more than 5 minutes:

{
  "name": "Cancel Stale Limit Order",
  "notes": "If a BUY LIMIT order has been pending for more than 300 seconds, cancel it.",
  "evaluationMode": "TIMED",
  "evaluationIntervalMs": 60000,
  "instruments": [
    { "symbol": "Coinbase:BTCUSD", "barInterval": "1M" }
  ],
  "variables": { "prices": {}, "times": {}, "numbers": { "max_order_age_s": "300" } },
  "marketRules": [
    {
      "label": "Cancel stale BUY LIMIT",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand":  { "function": "GET_ORDER_COUNT", "arguments": { "side": "BUY", "status": "RECEIVED" } },
              "operator": ">",
              "rightOperand": 0
            },
            {
              "leftOperand": {
                "function": "SECONDS_SINCE",
                "arguments": {
                  "target": { "function": "ORDER_OPEN_TIME", "arguments": { "side": "BUY", "status": "RECEIVED" } }
                }
              },
              "operator": ">",
              "rightOperand": { "function": "GET_VARIABLE", "arguments": { "name": "max_order_age_s" } }
            }
          ]
        }
      ],
      "actions": [
        {
          "type": "CANCEL_ORDER",
          "orderArgs": {
            "exchange": { "$ref": "instrument", "index": 0 },
            "symbol":   { "$ref": "instrument", "index": 0 },
            "side": "BUY"
          }
        }
      ]
    }
  ]
}

Key points:
- ORDER_OPEN_TIME returns the created_at timestamp of the most recent matching order (same filter args as GET_ORDER_COUNT).
- POSITION_OPEN_TIME returns the time the current open position was opened (each new position, after a close or a flip, has its own) — use it to enforce minimum or maximum hold times.
- ORDER_CLOSE_TIME / POSITION_CLOSE_TIME return the fill/cancel time of the most recently closed order or position — useful for post-exit cooldowns without a SET_VARIABLE.
- Always guard with GET_ORDER_COUNT > 0 (or GET_POSITION_SIZE != 0) before using these — they return NaN if nothing matches.
