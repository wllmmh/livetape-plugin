# LiveTape strategy examples: state and timing

Cooldowns, trading-session windows, session state, multi-step setups and stopping the agent.

Examples are teaching artifacts, not production strategies:
- FOCUSED MECHANIC — isolates one wire-format or execution mechanic.
- COMPOSITION PATTERN — combines a few primitives into a reusable trader workflow.
- MULTI-RULE COMPOSITION — shows state or order lifecycle flowing across several rules.

Select the primitives the user's request needs and compose them; add the entry, exit, sizing,
risk, reset and duplicate-order guards the example leaves out. The schema itself is in
[strategy-schema.md](strategy-schema.md).

## COMPOSITION PATTERN — TIME-BASED COOLDOWN
This pattern enforces a minimum time between entries. On entry, stamp the current engine
time into a variable using NOW. On subsequent bars, check SECONDS_SINCE that variable.

{
  "name": "RSI Entry with Cooldown",
  "notes": "Buy when RSI < 30, but no more than once every 3600 seconds (1 hour).",
  "evaluationMode": "TIMED",
  "evaluationIntervalMs": 60000,
  "instruments": [
    { "symbol": "Kraken:ETHUSD", "barInterval": "1M" }
  ],
  "variables": {
    "prices":   {},
    "times":    { "last_entry": "2000-01-01T00:00:00Z" },
    "numbers":  { "cooldown_seconds": "3600" }
  },
  "marketRules": [
    {
      "label": "RSI Oversold Entry",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand":  { "function": "RSI", "arguments": { "period": 14 }, "bar_index": 1 },
              "operator": "<",
              "rightOperand": 30
            },
            {
              "leftOperand":  { "function": "SECONDS_SINCE", "arguments": { "target": "last_entry" } },
              "operator": ">",
              "rightOperand": { "function": "GET_VARIABLE", "arguments": { "name": "cooldown_seconds" } }
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
            "orderType": "MARKET",
            "exchange": { "$ref": "instrument", "index": 0 },
            "symbol":   { "$ref": "instrument", "index": 0 },
            "quantity": 0.01
          }
        },
        {
          "type": "SET_VARIABLE",
          "targetId": "last_entry",
          "variableType": "times",
          "value": { "function": "NOW", "arguments": {} }
        }
      ]
    }
  ]
}

Key points:
- Declare time variables with a far-past initial value so SECONDS_SINCE is large on the first bar.
- NOW, SECONDS_SINCE and GET_VARIABLE ignore bar_index, so the nodes leave it out.
- SET_VARIABLE fires with SEND_ORDER, so this measures time between submissions; use POSITION_CLOSE_TIME when the cooldown must begin after an exit.
- VARIABLE_LAST_UPDATED can timestamp an existing state variable automatically when a separate time variable adds no value.

## COMPOSITION PATTERN — SESSION-GATED SIGNAL
Add a trading hours gate to an existing signal. The time conditions are just additional
conditions in the same group — SECONDS_SINCE >= 0 AND SECONDS_UNTIL > 0 form the window.

{
  "name": "Session Gated Entry",
  "evaluationMode": "TIMED",
  "evaluationIntervalMs": 60000,
  "instruments": [
    { "symbol": "Coinbase:BTCUSD", "barInterval": "1M" }
  ],
  "variables": {
    "prices": {},
    "times":  { "session_open": "13:30", "session_close": "20:00" },
    "numbers": {}
  },
  "marketRules": [
    {
      "label": "Enter long — inside session window only",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand":  { "function": "SECONDS_SINCE", "arguments": { "target": "session_open" }, "bar_index": 1 },
              "operator": ">=",
              "rightOperand": 0
            },
            {
              "leftOperand":  { "function": "SECONDS_UNTIL", "arguments": { "target": "session_close" }, "bar_index": 1 },
              "operator": ">",
              "rightOperand": 0
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
    },
    {
      "label": "Close position at session end",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand":  { "function": "SECONDS_SINCE", "arguments": { "target": "session_close" }, "bar_index": 1 },
              "operator": ">=",
              "rightOperand": 0
            },
            {
              "leftOperand":  { "function": "GET_POSITION_SIZE", "arguments": {} },
              "operator": "!=",
              "rightOperand": 0
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
- SECONDS_SINCE(open) >= 0 AND SECONDS_UNTIL(close) > 0 is the canonical session window pattern.
- SECONDS_UNTIL > 0 means "time remaining until close is positive" i.e. we haven't reached close yet.
- Use SECONDS_SINCE(close) >= 0 for the forced exit rule — it fires on the first evaluation cycle at or after close.
- Replace the position-size guard condition with your actual signal conditions to apply the window to any strategy.

## MULTI-RULE COMPOSITION — TRACK AND RESET SESSION STATE
Track a session high. Initialize it on the first session bar, raise it on new highs, and clear
it at session end so it resets next session.

{
  "name": "Session High Tracker",
  "evaluationMode": "TIMED",
  "evaluationIntervalMs": 60000,
  "instruments": [
    { "symbol": "Coinbase:BTCUSD", "barInterval": "1M" }
  ],
  "variables": {
    "prices": { "session_high": "" },
    "times":  { "session_open": "09:30", "session_close": "16:00" },
    "numbers": {}
  },
  "marketRules": [
    {
      "label": "Initialize or raise session high",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand":  { "function": "SECONDS_SINCE", "arguments": { "target": "session_open" }, "bar_index": 1 },
              "operator": ">=",
              "rightOperand": 0
            },
            {
              "leftOperand":  { "function": "SECONDS_UNTIL", "arguments": { "target": "session_close" }, "bar_index": 1 },
              "operator": ">",
              "rightOperand": 0
            },
            {
              "leftOperand":  { "function": "GET_VARIABLE", "arguments": { "name": "session_high" } },
              "operator": "is_none",
              "rightOperand": 0
            }
          ]
        },
        {
          "conditions": [
            {
              "leftOperand":  { "function": "SECONDS_SINCE", "arguments": { "target": "session_open" }, "bar_index": 1 },
              "operator": ">=",
              "rightOperand": 0
            },
            {
              "leftOperand":  { "function": "SECONDS_UNTIL", "arguments": { "target": "session_close" }, "bar_index": 1 },
              "operator": ">",
              "rightOperand": 0
            },
            {
              "leftOperand":  { "function": "GET_VARIABLE", "arguments": { "name": "session_high" } },
              "operator": "is_not_none",
              "rightOperand": 0
            },
            {
              "leftOperand":  { "function": "HIGH_PRICE", "arguments": {}, "bar_index": 1 },
              "operator": ">",
              "rightOperand": { "function": "GET_VARIABLE", "arguments": { "name": "session_high" } }
            }
          ]
        }
      ],
      "actions": [
        {
          "type": "SET_VARIABLE",
          "targetId": "session_high",
          "variableType": "prices",
          "value": { "function": "HIGH_PRICE", "arguments": {}, "bar_index": 1 }
        }
      ]
    },
    {
      "label": "Clear session high at session end",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand":  { "function": "SECONDS_SINCE", "arguments": { "target": "session_close" }, "bar_index": 1 },
              "operator": ">=",
              "rightOperand": 0
            },
            {
              "leftOperand":  { "function": "GET_VARIABLE", "arguments": { "name": "session_high" } },
              "operator": "is_not_none",
              "rightOperand": 0
            }
          ]
        }
      ],
      "actions": [
        {
          "type": "CLEAR_VARIABLE",
          "targetId": "session_high"
        }
      ]
    }
  ]
}

Key points:
- CLEAR_VARIABLE takes only "targetId" — no variableType or value.
- One condition group initializes the value; the other updates it only when a new session high is made.
- Declare price variables as "" (empty string) in the initial config to signal they start unset.

## MULTI-RULE COMPOSITION — ARM, CONFIRM, OR EXPIRE A SETUP
Separate signal detection from entry. One rule timestamps an oversold setup, another waits
for both a minimum bar count and price-momentum recovery, and a third expires stale setups.

{
  "name": "Delayed RSI Recovery Entry",
  "notes": "Arm on oversold RSI, enter only after 3 bars and an RSI recovery, or discard the setup after 10 bars.",
  "evaluationMode": "TIMED",
  "evaluationIntervalMs": 60000,
  "instruments": [
    { "symbol": "Kraken:ETHUSD", "barInterval": "1M" }
  ],
  "variables": {
    "prices": {},
    "times":  { "setup_time": "" },
    "numbers": { "wait_bars": "3", "max_wait_bars": "10", "qty": "0.1" }
  },
  "marketRules": [
    {
      "label": "Arm oversold setup",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand":  { "function": "RSI", "arguments": { "period": 14 }, "bar_index": 1 },
              "operator": "<=",
              "rightOperand": 30
            },
            {
              "leftOperand":  { "function": "GET_VARIABLE", "arguments": { "name": "setup_time" } },
              "operator": "is_none",
              "rightOperand": 0
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
          "type": "SET_VARIABLE",
          "targetId": "setup_time",
          "variableType": "times",
          "value": { "function": "NOW", "arguments": {} }
        }
      ]
    },
    {
      "label": "Enter after delay and RSI recovery",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand":  { "function": "GET_VARIABLE", "arguments": { "name": "setup_time" } },
              "operator": "is_not_none",
              "rightOperand": 0
            },
            {
              "leftOperand":  { "function": "BARS_SINCE", "arguments": { "target": "setup_time" }, "bar_index": 1 },
              "operator": ">=",
              "rightOperand": { "function": "GET_VARIABLE", "arguments": { "name": "wait_bars" } }
            },
            {
              "leftOperand":  { "function": "BARS_SINCE", "arguments": { "target": "setup_time" }, "bar_index": 1 },
              "operator": "<=",
              "rightOperand": { "function": "GET_VARIABLE", "arguments": { "name": "max_wait_bars" } }
            },
            {
              "leftOperand":  { "function": "RSI", "arguments": { "period": 14 }, "bar_index": 1 },
              "operator": ">",
              "rightOperand": 30
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
        },
        { "type": "CLEAR_VARIABLE", "targetId": "setup_time" }
      ]
    },
    {
      "label": "Expire stale setup",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand":  { "function": "GET_VARIABLE", "arguments": { "name": "setup_time" } },
              "operator": "is_not_none",
              "rightOperand": 0
            },
            {
              "leftOperand":  { "function": "BARS_SINCE", "arguments": { "target": "setup_time" }, "bar_index": 1 },
              "operator": ">",
              "rightOperand": { "function": "GET_VARIABLE", "arguments": { "name": "max_wait_bars" } }
            }
          ]
        }
      ],
      "actions": [
        { "type": "CLEAR_VARIABLE", "targetId": "setup_time" }
      ]
    }
  ]
}

Key points:
- SET_VARIABLE(NOW) turns a transient setup into durable state shared by later rules.
- BARS_SINCE accepts the time-variable name directly and advances in the selected bar context.
- Rule order matters: arm first, attempt entry second, then expire. Clearing setup_time prevents the later rule from acting on stale state.
- This is setup orchestration only; position exit and protective-risk rules remain separate compositions.

## MULTI-RULE COMPOSITION — ONE TRADE THEN STOP
Use filled-position state to distinguish "never traded" from "traded and now flat." STOP_AGENT
with "targetId": "self" stops the running agent; another agent's id stops that agent instead.

{
  "name": "One Trade Per Session",
  "notes": "Enter on an RSI signal, mark the session only after the position opens, then stop the agent after that position closes.",
  "evaluationMode": "TIMED",
  "evaluationIntervalMs": 60000,
  "instruments": [
    { "symbol": "Coinbase:BTCUSD", "barInterval": "1M" }
  ],
  "variables": {
    "prices": {},
    "times":  {},
    "numbers": { "traded_today": "0", "qty": "0.01" }
  },
  "marketRules": [
    {
      "label": "Submit first entry",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand":  { "function": "GET_VARIABLE", "arguments": { "name": "traded_today" } },
              "operator": "==",
              "rightOperand": { "function": "LITERAL_FALSE", "arguments": {} }
            },
            {
              "leftOperand":  { "function": "RSI", "arguments": { "period": 14 }, "bar_index": 1 },
              "operator": "<",
              "rightOperand": 30
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
            "orderType": "MARKET",
            "exchange": { "$ref": "instrument", "index": 0 },
            "symbol":   { "$ref": "instrument", "index": 0 },
            "quantity": { "function": "GET_VARIABLE", "arguments": { "name": "qty" } }
          }
        }
      ]
    },
    {
      "label": "Mark session after entry fills",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand":  { "function": "GET_POSITION_SIZE", "arguments": {} },
              "operator": "!=",
              "rightOperand": 0
            },
            {
              "leftOperand":  { "function": "GET_VARIABLE", "arguments": { "name": "traded_today" } },
              "operator": "==",
              "rightOperand": { "function": "LITERAL_FALSE", "arguments": {} }
            }
          ]
        }
      ],
      "actions": [
        {
          "type": "SET_VARIABLE",
          "targetId": "traded_today",
          "variableType": "numbers",
          "value": { "function": "LITERAL_TRUE", "arguments": {} }
        }
      ]
    },
    {
      "label": "Stop after the filled position is later closed",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand":  { "function": "GET_VARIABLE", "arguments": { "name": "traded_today" } },
              "operator": "==",
              "rightOperand": { "function": "LITERAL_TRUE", "arguments": {} }
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
        { "type": "STOP_AGENT", "targetId": "self" }
      ]
    }
  ]
}

Key points:
- Do not set the traded flag when SEND_ORDER is merely submitted; mark it only after account state confirms a nonzero position.
- LITERAL_TRUE and LITERAL_FALSE make the numeric flag's boolean intent explicit. LITERAL_NONE represents an unset/NaN value for is_none checks.
- The pending-order guard prevents repeated entry submissions before the first order fills.
- This composition deliberately omits the position's exit logic; combine it with the relevant exit and risk mechanics.
