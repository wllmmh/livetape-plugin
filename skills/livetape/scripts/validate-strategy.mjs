#!/usr/bin/env node
// Checks a LiveTape strategy JSON before the user imports it.
//
//   node validate-strategy.mjs strategy.json
//   cat strategy.json | node validate-strategy.mjs
//
// Prints each problem as "error: …" or "warning: …" and exits 1 when there is an error.
// Errors are what LiveTape would refuse or what departs from the documented format (a rule
// with no condition groups, say); warnings are legal JSON that probably does not do what was
// meant (an open-bar read needs the Pro plan, and so on). The app's importer is the final
// word; this catches the usual mistakes first.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const BAR_READING_FUNCTIONS = [
  'OPEN_PRICE', 'HIGH_PRICE', 'LOW_PRICE', 'CLOSE_PRICE', 'VOLUME',
  'SMA', 'EMA', 'RSI', 'ATR', 'MACD', 'VWAP', 'BOLLINGER', 'DONCHIAN', 'ADX',
  'STOCHASTIC', 'PARABOLIC_SAR', 'Z_SCORE', 'OBV',
  'HIGHEST', 'LOWEST', 'SUM', 'MEAN', 'MEDIAN', 'MODE', 'STDEV', 'VARIANCE',
  'GET_SERIES',
];
export const MATH_FUNCTIONS = ['ADD', 'SUBTRACT', 'MULTIPLY', 'DIVIDE', 'ABS'];
export const FUNCTIONS = [
  ...BAR_READING_FUNCTIONS,
  ...MATH_FUNCTIONS,
  'GET_VARIABLE',
  'SECONDS_SINCE', 'SECONDS_UNTIL', 'MINUTES_SINCE', 'MINUTES_UNTIL', 'BARS_SINCE', 'BARS_UNTIL', 'NOW',
  'GET_ORDER_COUNT', 'GET_POSITION_SIZE', 'GET_POSITION_AVG_PRICE', 'GET_POSITION_PNL',
  'GET_POSITION_PNL_PCT', 'GET_STOP_PRICE', 'GET_LIMIT_PRICE',
  'VARIABLE_LAST_UPDATED', 'ORDER_OPEN_TIME', 'ORDER_CLOSE_TIME', 'POSITION_OPEN_TIME',
  'POSITION_CLOSE_TIME', 'MARKET_OPEN_TIME', 'MARKET_CLOSE_TIME',
  'PRICE_TO_BEAT', 'MARKET_STATUS', 'SECONDS_SINCE_LAST_TICK',
  'LITERAL_TRUE', 'LITERAL_FALSE', 'LITERAL_NONE',
];
export const ACTION_TYPES = [
  'SEND_ORDER', 'MODIFY_ORDER', 'CANCEL_ORDER', 'CLOSE_POSITION', 'SET_VARIABLE',
  'CLEAR_VARIABLE', 'START_AGENT', 'STOP_AGENT', 'SET_MARKET',
];
export const OPERATORS = ['>', '<', '==', '!=', '>=', '<=', 'is_none', 'is_not_none'];
export const BAR_INTERVALS = [
  '1S', '5S', '10S', '15S', '30S', '1M', '2M', '5M', '15M', '30M', '1H', '2H', '3H', '4H', '1D',
];
const ORDER_TYPES = ['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT'];
const SIDES = ['BUY', 'SELL'];
const TIME_IN_FORCE = ['GTC', 'GTD', 'FOK', 'FAK'];
const ORDER_TARGET_ACTIONS = ['SEND_ORDER', 'MODIFY_ORDER', 'CANCEL_ORDER', 'CLOSE_POSITION'];
const KEY_PATTERN = /^[a-z0-9_]+$/;
// "Exchange:TICKER"; a prediction market adds one "/<Outcome>" and a reference ticker may
// carry a ".TWAP60" suffix.
const SYMBOL_PATTERN = /^[A-Za-z]+:[A-Za-z0-9._-]+(\/[A-Za-z0-9 ._-]+)?$/;

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNode = (v) => isObject(v) && 'function' in v;
const isRef = (v) => isObject(v) && v.$ref === 'instrument';
const sourceOf = (symbol) => (typeof symbol === 'string' ? symbol.split(':')[0].toLowerCase() : '');

export function validateStrategy(strategy) {
  const errors = [];
  const warnings = [];
  const error = (msg) => errors.push(msg);
  const warn = (msg) => warnings.push(msg);

  if (!isObject(strategy)) {
    error('top level must be a JSON object');
    return { errors, warnings };
  }
  if ('id' in strategy) error('remove the strategy "id" field; LiveTape assigns IDs on import');
  if (typeof strategy.name !== 'string' || !strategy.name.trim()) warn('"name" is missing');
  if (strategy.evaluationMode !== undefined && strategy.evaluationMode !== 'TIMED') {
    warn(`evaluationMode "${strategy.evaluationMode}": emit "TIMED"`);
  }

  const instruments = Array.isArray(strategy.instruments) ? strategy.instruments : [];
  if (!Array.isArray(strategy.instruments) || instruments.length === 0) {
    warn('"instruments" is empty; the user will have to add a market before deploying');
  }
  const symbols = instruments.map((inst, i) => {
    if (!isObject(inst)) {
      error(`instruments[${i}] must be an object`);
      return '';
    }
    if (typeof inst.symbol !== 'string' || !SYMBOL_PATTERN.test(inst.symbol)) {
      error(`instruments[${i}].symbol "${inst.symbol}" is not "Exchange:TICKER" (or "Polymarket:<slug>/<Outcome>")`);
    }
    if (inst.barInterval !== undefined && !BAR_INTERVALS.includes(inst.barInterval)) {
      error(`instruments[${i}].barInterval "${inst.barInterval}" is not one of ${BAR_INTERVALS.join(', ')}`);
    }
    return typeof inst.symbol === 'string' ? inst.symbol : '';
  });
  const slotSource = (ref) => (isRef(ref) ? sourceOf(symbols[ref.index]) : sourceOf(ref));

  const declared = new Set();
  const variables = strategy.variables ?? {};
  if (!isObject(variables)) error('"variables" must be an object with prices, times and numbers');
  for (const [section, values] of Object.entries(isObject(variables) ? variables : {})) {
    if (!['prices', 'times', 'numbers'].includes(section)) {
      error(`variables.${section}: the sections are prices, times and numbers`);
      continue;
    }
    for (const [key, value] of Object.entries(isObject(values) ? values : {})) {
      declared.add(key);
      if (!KEY_PATTERN.test(key)) error(`variables.${section}.${key}: keys must match ${KEY_PATTERN}`);
      if (typeof value !== 'string') error(`variables.${section}.${key}: values are strings, e.g. "1.5"`);
    }
  }

  const seriesNames = new Set();
  const customIndicators = strategy.customIndicators ?? [];
  if (!Array.isArray(customIndicators)) error('"customIndicators" must be an array');
  (Array.isArray(customIndicators) ? customIndicators : []).forEach((ci, i) => {
    if (!isObject(ci) || typeof ci.name !== 'string' || !KEY_PATTERN.test(ci.name)) {
      error(`customIndicators[${i}].name must match ${KEY_PATTERN}`);
      return;
    }
    seriesNames.add(ci.name);
    if (!isNode(ci.expression)) error(`customIndicators[${i}].expression must be an ExpressionNode`);
    else checkNode(ci.expression, `customIndicators[${i}].expression`);
  });

  function checkNode(node, path) {
    if (!isNode(node)) return;
    const fn = node.function;
    if (!FUNCTIONS.includes(fn)) {
      error(`${path}: unknown function "${fn}"`);
      return;
    }
    if (node.bar_index !== undefined && !(Number.isInteger(node.bar_index) && node.bar_index >= 0)) {
      error(`${path}: bar_index must be a non-negative integer`);
    }
    const args = node.arguments;
    if (MATH_FUNCTIONS.includes(fn)) {
      const arity = fn === 'ABS' ? 1 : 2;
      if (!Array.isArray(args) || args.length !== arity) {
        error(`${path}: ${fn} takes a positional array of ${arity} argument${arity === 1 ? '' : 's'}`);
      }
    } else if (args !== undefined && !isObject(args)) {
      error(`${path}: arguments must be an object`);
    }
    if (fn === 'GET_SERIES' && isObject(args) && !seriesNames.has(args.name)) {
      error(`${path}: GET_SERIES "${args?.name}" has no matching customIndicators entry`);
    }
    if (fn === 'GET_VARIABLE' && isObject(args) && typeof args.name === 'string' && !declared.has(args.name)) {
      warn(`${path}: variable "${args.name}" is not declared, so it is unset until a rule sets it`);
    }
    const children = Array.isArray(args) ? args : isObject(args) ? Object.values(args) : [];
    children.forEach((child, i) => checkNode(child, `${path}.arguments[${i}]`));
  }

  // A root operand reads the open bar when a bar-reading node sits at bar_index 0, directly
  // or through math nodes, whose arguments are roots too.
  const readsOpenBar = (operand) => {
    if (!isNode(operand)) return false;
    if (MATH_FUNCTIONS.includes(operand.function)) {
      const args = operand.arguments;
      return (Array.isArray(args) ? args : isObject(args) ? Object.values(args) : []).some(readsOpenBar);
    }
    return BAR_READING_FUNCTIONS.includes(operand.function) && operand.bar_index === 0;
  };
  const checkRoot = (operand, path) => {
    checkNode(operand, path);
    if (readsOpenBar(operand)) {
      warn(`${path}: bar_index 0 reads the still-forming bar (Pro plan); use 1 for the last closed bar`);
    }
  };

  if (!Array.isArray(strategy.marketRules)) {
    error('"marketRules" must be an array of rules');
    return { errors, warnings };
  }
  for (const key of Object.keys(strategy)) {
    if (/rules$/i.test(key) && key !== 'marketRules') error(`"${key}": put every rule in "marketRules"`);
  }

  strategy.marketRules.forEach((rule, r) => {
    const where = `marketRules[${r}]${isObject(rule) && rule.label ? ` "${rule.label}"` : ''}`;
    if (!isObject(rule)) {
      error(`${where} must be an object`);
      return;
    }
    if ('id' in rule) error(`${where}: remove the rule "id" field`);
    if (typeof rule.label !== 'string' || !rule.label.trim()) error(`${where}: "label" is required`);
    if ('conditions' in rule) error(`${where}: use "condition_groups": [{ "conditions": [...] }], not "conditions"`);
    if (!Array.isArray(rule.condition_groups) || rule.condition_groups.length === 0) {
      error(`${where}: "condition_groups" must be a non-empty array`);
    } else {
      rule.condition_groups.forEach((group, g) => {
        if (!isObject(group) || !Array.isArray(group.conditions)) {
          error(`${where}.condition_groups[${g}] must be { "conditions": [...] }`);
          return;
        }
        group.conditions.forEach((c, k) => {
          const path = `${where}.condition_groups[${g}].conditions[${k}]`;
          if (!isObject(c)) {
            error(`${path} must be an object`);
            return;
          }
          if (!OPERATORS.includes(c.operator)) error(`${path}: operator "${c.operator}" is not one of ${OPERATORS.join(' ')}`);
          checkRoot(c.leftOperand, `${path}.leftOperand`);
          checkRoot(c.rightOperand, `${path}.rightOperand`);
        });
      });
    }
    if (!Array.isArray(rule.actions) || rule.actions.length === 0) {
      error(`${where}: "actions" must be a non-empty array`);
      return;
    }
    rule.actions.forEach((action, a) => checkAction(action, `${where}.actions[${a}]`));
  });

  function checkAction(action, path) {
    if (!isObject(action) || !ACTION_TYPES.includes(action.type)) {
      error(`${path}: type "${action?.type}" is not one of ${ACTION_TYPES.join(', ')}`);
      return;
    }
    const args = isObject(action.orderArgs) ? action.orderArgs : {};
    // SEND_ORDER without a symbol trades instrument 0; the other order actions without one
    // only filter existing orders and positions.
    const target = args.symbol ?? (action.type === 'SEND_ORDER' ? { $ref: 'instrument', index: 0 } : undefined);
    const source = target === undefined ? ''
      : typeof target === 'string' && !target.includes(':') ? slotSource(args.exchange)
      : slotSource(target);
    if (ORDER_TARGET_ACTIONS.includes(action.type) && source === 'polybolt') {
      error(`${path}: ${action.type} targets a PolyBolt reference feed, which cannot be traded`);
    }
    if (isRef(args.symbol) && (args.symbol.index < 0 || args.symbol.index >= symbols.length)) {
      error(`${path}: orderArgs.symbol refers to instrument ${args.symbol.index}, which does not exist`);
    }
    if (action.type === 'SEND_ORDER') {
      if (!SIDES.includes(args.action)) error(`${path}: orderArgs.action must be BUY or SELL`);
      if (!ORDER_TYPES.includes(args.orderType)) error(`${path}: orderArgs.orderType must be one of ${ORDER_TYPES.join(', ')}`);
      if (args.amount !== undefined && args.quantity !== undefined) warn(`${path}: set "amount" or "quantity", not both ("amount" wins)`);
      if (['LIMIT', 'STOP_LIMIT'].includes(args.orderType) && args.limitPrice === undefined) error(`${path}: ${args.orderType} needs limitPrice`);
      if (['STOP', 'STOP_LIMIT'].includes(args.orderType) && args.stopPrice === undefined) error(`${path}: ${args.orderType} needs stopPrice`);
      if (source === 'polymarket') {
        if (['STOP', 'STOP_LIMIT'].includes(args.orderType)) error(`${path}: prediction markets have no stop orders`);
        if (typeof args.limitPrice === 'number' && !(args.limitPrice > 0 && args.limitPrice < 1)) {
          error(`${path}: a prediction-market limit price is between 0 and 1`);
        }
      }
    }
    if (args.timeInForce !== undefined && !TIME_IN_FORCE.includes(args.timeInForce)) {
      error(`${path}: timeInForce must be one of ${TIME_IN_FORCE.join(', ')}`);
    }
    if (args.timeInForce === 'GTD' && args.expiration === undefined) error(`${path}: GTD needs an expiration`);
    for (const key of ['quantity', 'amount', 'limitPrice', 'stopPrice']) checkRoot(args[key], `${path}.orderArgs.${key}`);
    if (isObject(args.expiration) && isNode(args.expiration.at)) checkRoot(args.expiration.at, `${path}.orderArgs.expiration.at`);

    if (action.type === 'SET_VARIABLE') {
      if (typeof action.targetId !== 'string' || !KEY_PATTERN.test(action.targetId)) error(`${path}: targetId must match ${KEY_PATTERN}`);
      if (!['prices', 'times', 'numbers'].includes(action.variableType)) error(`${path}: variableType must be prices, times or numbers`);
      checkRoot(action.value, `${path}.value`);
    }
    if (action.type === 'CLEAR_VARIABLE' && typeof action.targetId !== 'string') error(`${path}: targetId names the variable to clear`);
    if (action.type === 'STOP_AGENT' && action.targetId !== 'self') {
      warn(`${path}: import reads an empty targetId as "self" and clears ids of agents the user does not own; use "self" and have the user pick another agent in the editor`);
    }
    if (action.type === 'START_AGENT' && action.targetId) {
      warn(`${path}: leave targetId ""; the user picks the agent in the editor`);
    }
    if (action.type === 'SET_MARKET') {
      const m = isObject(action.marketArgs) ? action.marketArgs : {};
      if (!Number.isInteger(m.index) || m.index < 0 || m.index >= symbols.length) error(`${path}: marketArgs.index must name an instrument slot`);
      if (!['symbol', 'next_in_series'].includes(m.mode)) error(`${path}: marketArgs.mode must be "symbol" or "next_in_series"`);
      const current = sourceOf(symbols[m.index]);
      if (m.mode === 'symbol') {
        if (typeof m.symbol !== 'string' || !SYMBOL_PATTERN.test(m.symbol)) error(`${path}: marketArgs.symbol must be "Exchange:TICKER"`);
        else if ((current === 'polybolt') !== (sourceOf(m.symbol) === 'polybolt')) {
          error(`${path}: a slot cannot change between a tradable market and a PolyBolt reference feed`);
        }
      }
      if (m.mode === 'next_in_series' && current === 'polybolt') {
        error(`${path}: slot ${m.index} is a reference feed and has no next market in a series`);
      } else if (m.mode === 'next_in_series' && current !== 'polymarket') {
        warn(`${path}: next_in_series only moves a recurring Polymarket market; slot ${m.index} is not one`);
      }
    }
  }

  return { errors, warnings };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const path = process.argv[2];
  const text = path && path !== '-' ? readFileSync(path, 'utf8') : readFileSync(0, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    console.log(`error: invalid JSON: ${err.message}`);
    process.exit(1);
  }
  const { errors, warnings } = validateStrategy(parsed);
  for (const e of errors) console.log(`error: ${e}`);
  for (const w of warnings) console.log(`warning: ${w}`);
  if (errors.length === 0) console.log(warnings.length ? 'ok, with warnings' : 'ok');
  process.exit(errors.length ? 1 : 0);
}
