# QuickBEAM Ideas

## Done

- ~~`console.log` → Logger~~ — implemented (console.zig routes to Erlang logger)
- ~~`structuredClone`~~ — implemented (web_apis.zig via JS_WriteObject/JS_ReadObject)
- ~~Resource limits~~ — implemented (`:memory_limit`, `:max_stack_size`)

## 1. CPU Timeout via Interrupt Handler

Use `JS_SetInterruptHandler` to kill runaway scripts.

```elixir
QuickBEAM.eval(rt, code, timeout: 5_000)
```

The interrupt handler checks elapsed time and returns non-zero to abort.
Can also count bytecode instructions for budget-based limiting (billing,
sandboxing untrusted code).

## 2. Runtime Pools

Pool runtimes for SSR / per-request isolation:

```elixir
QuickBEAM.Pool.start_link(
  name: :workers,
  size: 20,
  init: fn rt -> QuickBEAM.eval(rt, react_setup) end
)

html = QuickBEAM.Pool.run(:workers, fn rt ->
  QuickBEAM.call(rt, "renderPage", [assigns])
end)
```

Each runtime starts from bytecode, serves a request, gets `reset/1`.
Pure OTP (NimblePool).

## 3. Promise Lifecycle Tracing

Wire `JS_SetPromiseHook` to send BEAM messages on promise create/resolve/reject.

- Distributed tracing across JS/BEAM boundary
- Deadlock detection for stuck promises (crashed BEAM handler?)

## 4. Telemetry Integration

Wire interrupt handler, promise hook, and timers to `:telemetry`:

```elixir
:telemetry.execute([:quickbeam, :eval], %{duration: ns}, %{runtime: pid})
:telemetry.execute([:quickbeam, :beam_call], %{duration: ns}, %{handler: name})
```

JS runtimes become observable in Grafana, LiveDashboard, etc.

## 5. JS ↔ BEAM Process Identity

Extend existing `beam.self()` / `beam.send()` / `Process.monitor`:

- `beam.spawn(code)` — JS runtime spawning JS runtimes, supervised by BEAM
- `beam.link(pid)` / `beam.trap_exit()` — JS participating in OTP fault tolerance

## 6. JS ↔ ETS Bridge

Expose ETS to JS as a synchronous key-value store:

```js
const cache = beam.ets("my_cache");
cache.put("key", {data: 123});
const val = cache.get("key");
```

Multiple JS runtimes sharing concurrent-read ETS without GenServer bottleneck.

## 7. Resource Accounting

Combine memory_usage + CPU metering for complete per-runtime resource profiles.
A `QuickBEAM.Pool` could track all runtimes and kill the greediest under
pressure.

## Priority

1. CPU timeout (interrupt handler) — essential for untrusted code, tiny effort
2. Runtime pools — unlocks SSR, pure Elixir
3. Telemetry — observability, small effort
