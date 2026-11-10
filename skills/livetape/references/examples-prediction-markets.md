# LiveTape strategy examples: prediction markets

Polymarket up/down markets: reading the reference price they resolve on, buying an outcome with a limit order, and rolling to the next market of the series.

Examples are teaching artifacts, not production strategies. Select the primitives the user's
request needs and compose them; add the entry, exit, sizing, risk, reset and duplicate-order
guards the example leaves out. The schema itself is in [strategy-schema.md](strategy-schema.md).

Prediction markets, PolyBolt reference feeds and sub-minute intervals all need the Pro plan
or above.

## COMPOSITION PATTERN — UP/DOWN WINDOW WITH PRICE TO BEAT
Slot 0 is the outcome traded: "Up" on a 15-minute Bitcoin market. Slot 1 is the watch-only
60-second TWAP that market resolves on. Late in the window, when the TWAP is above the price
to beat by a margin, buy "Up" with a limit that takes what the book offers at once. After
the window closes, roll slot 0 to the next market of the series.

{
  "name": "BTC 15m Up Late Entry",
  "notes": "Buy Up in the last two minutes when the TWAP leads the price to beat; roll to the next window after close.",
  "evaluationMode": "TIMED",
  "evaluationIntervalMs": 1000,
  "instruments": [
    { "symbol": "Polymarket:btc-updown-15m-1793291400/Up", "barInterval": "1M" },
    { "symbol": "PolyBolt:BTCUSD.TWAP60", "barInterval": "1S" }
  ],
  "variables": {
    "prices": {},
    "times": {},
    "numbers": { "lead_usd": "40", "max_price": "0.90", "shares": "20" }
  },
  "marketRules": [
    {
      "label": "Buy Up when the TWAP leads late in the window",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand": {
                "function": "SECONDS_UNTIL",
                "arguments": {
                  "target": {
                    "function": "MARKET_CLOSE_TIME",
                    "arguments": {
                      "exchange": { "$ref": "instrument", "index": 0 },
                      "symbol":   { "$ref": "instrument", "index": 0 }
                    }
                  }
                }
              },
              "operator": "<=",
              "rightOperand": 120
            },
            {
              "leftOperand": {
                "function": "SECONDS_UNTIL",
                "arguments": {
                  "target": {
                    "function": "MARKET_CLOSE_TIME",
                    "arguments": {
                      "exchange": { "$ref": "instrument", "index": 0 },
                      "symbol":   { "$ref": "instrument", "index": 0 }
                    }
                  }
                }
              },
              "operator": ">",
              "rightOperand": 10
            },
            {
              "leftOperand": {
                "function": "SECONDS_SINCE_LAST_TICK",
                "arguments": {
                  "exchange": { "$ref": "instrument", "index": 1 },
                  "symbol":   { "$ref": "instrument", "index": 1 }
                }
              },
              "operator": "<",
              "rightOperand": 5
            },
            {
              "leftOperand": {
                "function": "SUBTRACT",
                "arguments": [
                  { "function": "CLOSE_PRICE", "arguments": {}, "bar_index": 1, "symbol": { "$ref": "instrument", "index": 1 } },
                  {
                    "function": "PRICE_TO_BEAT",
                    "arguments": {
                      "exchange": { "$ref": "instrument", "index": 0 },
                      "symbol":   { "$ref": "instrument", "index": 0 }
                    }
                  }
                ]
              },
              "operator": ">=",
              "rightOperand": { "function": "GET_VARIABLE", "arguments": { "name": "lead_usd" } }
            },
            {
              "leftOperand":  { "function": "GET_POSITION_SIZE", "arguments": { "symbol": { "$ref": "instrument", "index": 0 } } },
              "operator": "==",
              "rightOperand": 0
            },
            {
              "leftOperand":  { "function": "GET_ORDER_COUNT", "arguments": { "symbol": { "$ref": "instrument", "index": 0 }, "status": "RECEIVED" } },
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
            "quantity": { "function": "GET_VARIABLE", "arguments": { "name": "shares" } },
            "limitPrice": { "function": "GET_VARIABLE", "arguments": { "name": "max_price" } },
            "timeInForce": "FAK"
          }
        }
      ]
    },
    {
      "label": "Roll to the next window after close",
      "condition_groups": [
        {
          "conditions": [
            {
              "leftOperand": {
                "function": "SECONDS_SINCE",
                "arguments": {
                  "target": {
                    "function": "MARKET_CLOSE_TIME",
                    "arguments": {
                      "exchange": { "$ref": "instrument", "index": 0 },
                      "symbol":   { "$ref": "instrument", "index": 0 }
                    }
                  }
                }
              },
              "operator": ">=",
              "rightOperand": 0
            }
          ]
        }
      ],
      "actions": [
        {
          "type": "CANCEL_ORDER",
          "orderArgs": {
            "exchange": { "$ref": "instrument", "index": 0 },
            "symbol":   { "$ref": "instrument", "index": 0 }
          }
        },
        {
          "type": "SET_MARKET",
          "marketArgs": { "index": 0, "mode": "next_in_series" }
        }
      ]
    }
  ]
}

Key points:
- Orders go to slot 0 only. PolyBolt slot 1 is read-only; an order, cancel or close aimed at it makes the strategy unsavable.
- PRICE_TO_BEAT is NaN until the window opens, so the lead condition is simply false before then.
- The slug in slot 0 is one specific window; the user picks the current one at deploy, and SET_MARKET "next_in_series" moves the slot forward after each close. Every node that uses InstrumentRef index 0 follows it.
- FAK takes what the book offers at or below 0.90 and cancels the rest, so nothing rests into the close. A plain GTC limit would rest until filled or canceled; GTD with { "at": MARKET_CLOSE_TIME } would expire at the close.
- Held shares need no exit rule: a share pays $1 if Up wins and $0 if it loses, and sim accounts settle it when the market resolves.
- SECONDS_SINCE_LAST_TICK guards against acting on a stalled reference feed.
