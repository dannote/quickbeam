# QuickBEAM

QuickJS-NG JavaScript engine embedded in the BEAM via Zig NIFs.

JS runtimes are GenServers. They live in supervision trees, send and
receive messages, and call into Erlang/OTP libraries — all without
leaving the BEAM.

## Quick start

```elixir
{:ok, rt} = QuickBEAM.start()
{:ok, 3} = QuickBEAM.eval(rt, "1 + 2")
{:ok, "HELLO"} = QuickBEAM.eval(rt, "'hello'.toUpperCase()")

# State persists across calls
QuickBEAM.eval(rt, "function greet(name) { return 'hi ' + name }")
{:ok, "hi world"} = QuickBEAM.call(rt, "greet", ["world"])

QuickBEAM.stop(rt)
```

## BEAM integration

JS can call Elixir functions and access OTP libraries:

```elixir
{:ok, rt} = QuickBEAM.start(handlers: %{
  "db.query" => fn [sql] -> MyRepo.query!(sql).rows end,
  "cache.get" => fn [key] -> Cachex.get!(:app, key) end,
})

{:ok, rows} = QuickBEAM.eval(rt, """
  const rows = await beam.call("db.query", "SELECT * FROM users LIMIT 5");
  rows.map(r => r.name);
""")
```

JS can also send messages to any BEAM process:

```javascript
// Get the runtime's own PID
const self = beam.self();

// Send to any PID
beam.send(somePid, {type: "update", data: result});

// Receive BEAM messages
Process.onMessage((msg) => {
  console.log("got:", msg);
});

// Monitor BEAM processes
const ref = Process.monitor(pid, (reason) => {
  console.log("process died:", reason);
});
Process.demonitor(ref);
```

## Supervision

Runtimes are OTP children with crash recovery:

```elixir
children = [
  {QuickBEAM,
   name: :renderer,
   id: :renderer,
   script: "priv/js/app.js",
   handlers: %{
     "db.query" => fn [sql, params] -> Repo.query!(sql, params).rows end,
   }},
  {QuickBEAM, name: :worker, id: :worker},
]

Supervisor.start_link(children, strategy: :one_for_one)

{:ok, html} = QuickBEAM.call(:renderer, "render", [%{page: "home"}])
```

The `:script` option loads a JS file at startup. If the runtime crashes,
the supervisor restarts it with a fresh context and re-evaluates the script.

## Resource limits

```elixir
{:ok, rt} = QuickBEAM.start(
  memory_limit: 10 * 1024 * 1024,  # 10 MB heap
  max_stack_size: 512 * 1024        # 512 KB call stack
)
```

## Introspection

```elixir
# List user-defined globals (excludes builtins)
{:ok, ["myVar", "myFunc"]} = QuickBEAM.globals(rt, user_only: true)

# Get any global's value
{:ok, 42} = QuickBEAM.get_global(rt, "myVar")

# Runtime diagnostics
QuickBEAM.info(rt)
# %{handlers: ["db.query"], memory: %{...}, global_count: 87}
```

## DOM

Every runtime has a live DOM tree backed by [lexbor](https://github.com/lexbor/lexbor) (the C library
behind PHP 8.4's DOM extension and Elixir's `fast_html`). JS gets a full `document` global:

```javascript
document.body.innerHTML = '<ul><li class="item">One</li><li class="item">Two</li></ul>';
const items = document.querySelectorAll("li.item");
items[0].textContent; // "One"
```

Elixir can read the DOM directly — no JS execution, no re-parsing:

```elixir
{:ok, rt} = QuickBEAM.start()
QuickBEAM.eval(rt, ~s[document.body.innerHTML = '<h1 class="title">Hello</h1>'])

# Returns Floki-compatible {tag, attrs, children} tuples
{:ok, {"h1", [{"class", "title"}], ["Hello"]}} = QuickBEAM.dom_find(rt, "h1")

# Batch queries
{:ok, items} = QuickBEAM.dom_find_all(rt, "li")

# Extract text and attributes
{:ok, "Hello"} = QuickBEAM.dom_text(rt, "h1")
{:ok, "/about"} = QuickBEAM.dom_attr(rt, "a", "href")

# Serialize back to HTML
{:ok, html} = QuickBEAM.dom_html(rt)
```

## Web APIs

Standard browser APIs backed by BEAM primitives, not JS polyfills:

| JS API | BEAM backend |
|---|---|
| `fetch` | `:httpc` |
| `document`, `querySelector` | lexbor (native C DOM) |
| `URL`, `URLSearchParams` | `:uri_string` |
| `Buffer` | `Base`, `:unicode` |
| `crypto.subtle` | `:crypto` |
| `compression.compress/decompress` | `:zlib` |
| `TextEncoder`, `TextDecoder` | Native Zig (UTF-8) |
| `crypto.getRandomValues` | `std.crypto.random` |
| `atob`, `btoa` | Native Zig |
| `setTimeout`, `setInterval` | Timer heap in worker thread |
| `console.log/warn/error` | Erlang logger |
| `performance.now` | `std.time.nanoTimestamp` |
| `structuredClone` | QuickJS serialization |
| `queueMicrotask` | `JS_EnqueueJob` |

## Data conversion

No JSON in the data path. JS values map directly to BEAM terms:

| JS | Elixir |
|---|---|
| `number` (integer) | `integer` |
| `number` (float) | `float` |
| `string` | `String.t()` |
| `boolean` | `boolean` |
| `null` | `nil` |
| `undefined` | `nil` |
| `Array` | `list` |
| `Object` | `map` (string keys) |
| `Uint8Array` | `binary` |
| `Symbol("name")` | `:name` (atom) |
| `Infinity` / `NaN` | `:Infinity` / `:NaN` |
| PID / Ref / Port | Opaque JS object (round-trips) |

## TypeScript

Type definitions for the BEAM-specific JS API:

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "types": ["./path/to/quickbeam.d.ts"]
  }
}
```

The `.d.ts` file covers `beam`, `Process`, `BeamPid`, and `compression`.
Standard Web APIs are typed by TypeScript's `lib.dom.d.ts`.

## Performance

vs QuickJSEx 0.3.1 (Rust/Rustler, JSON serialization):

| Benchmark | Speedup |
|---|---|
| Function call — small map | **2.5x faster** |
| Function call — large data | **4.1x faster** |
| Concurrent JS execution | **1.35x faster** |
| `beam.callSync` (JS→BEAM) | 5 μs overhead (unique to QuickBEAM) |
| Startup | ~600 μs (parity) |

See [`bench/`](bench/README.md) for details.

## Installation

```elixir
def deps do
  [{:quickbeam, "~> 0.1.0"}]
end
```

Requires Zig 0.15+ (installed automatically by Zigler, or use system Zig).

## Examples

- [`examples/content_pipeline/`](examples/content_pipeline/) — three
  supervised JS runtimes forming a content moderation pipeline, with tests.

## License

MIT
