# QuickJS–BEAM Deep Integration Plan

## 1. Shared Atom Table (Low effort, Medium impact)
- Map common BEAM atoms (`:ok`, `:error`, `:nil`, `:true`, `:false`, handler names) to QuickJS atom IDs
- Cache atom mappings at runtime init
- Eliminate repeated string interning for handler names on every `beam.call`

## 2. Promise Await Without Polling (Low effort, Medium impact)
- Replace busy-polling `await_promise` loop with direct promise resolve/reject C callbacks
- Use `JS_PromiseThen` or equivalent to register callbacks
- Remove temporary globals (`__qb_N_s`, `__qb_N_v`) and 1ms sleep granularity

## 3. Lazy Proxy Objects for BEAM→JS (Medium effort, High impact)
- Instead of eagerly converting BEAM maps/lists to JS objects, create proxy JSValues
- Proxy intercepts property access and converts only accessed fields on demand
- Makes `call_with_data` near-zero-cost for partial access patterns

## 4. Scheduler Integration — Kill OS Thread (High effort, Very High impact)
- Replace per-runtime OS thread with yielding NIF execution on dirty schedulers
- Use QuickJS interrupt handler for reduction-based yielding
- Replace hand-rolled message queue with Erlang process mailbox
- Enables 10K+ JS contexts without 10K OS threads

## 5. Zero-Copy Strings at Boundary (Medium effort, Medium impact)
- For JS→BEAM: reference QuickJS string memory directly where possible
- For BEAM→JS: avoid intermediate allocations
- Strings are the #1 payload type; eliminate redundant copies

## 6. Workers as Real BEAM Processes (Medium effort, High impact)
- `new Worker(script)` spawns a real BEAM process with its own QuickJS context
- `postMessage` becomes `Erlang send`
- Worker crash → `:DOWN` message → `onerror`
- Gets supervision, monitoring, `:pg` distribution for free
