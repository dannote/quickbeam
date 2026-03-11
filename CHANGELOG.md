# Changelog

## 0.1.0

Initial release.

### JavaScript Engine

- QuickJS-NG embedded via Zig NIFs — no system JS runtime needed
- Runtimes are GenServers with full OTP supervision support
- Persistent state across `eval/2` and `call/3` calls
- ES module loading with `load_module/3`
- Bytecode compilation and loading for fast cloning
- CPU timeout with `JS_SetInterruptHandler`
- Configurable memory limit and stack size

### BEAM Integration

- `beam.call` / `beam.callSync` — JS calls Elixir handler functions
- `beam.send` / `beam.self` — JS sends messages to BEAM processes
- `Process.onMessage` / `Process.monitor` / `Process.demonitor`
- Direct BEAM term conversion (no JSON serialization)
- Runtime pools via NimblePool

### Web APIs

Standard browser APIs backed by BEAM/Zig primitives:

- `fetch`, `Request`, `Response`, `Headers` — `:httpc`
- `document`, `querySelector`, `createElement` — lexbor native DOM
- `URL`, `URLSearchParams` — `:uri_string`
- `crypto.subtle` (digest, sign, verify, encrypt, decrypt, generateKey, deriveBits) — `:crypto`
- `crypto.getRandomValues`, `randomUUID` — Zig `std.crypto.random`
- `TextEncoder`, `TextDecoder` — native Zig UTF-8
- `TextEncoderStream`, `TextDecoderStream`
- `ReadableStream`, `WritableStream`, `TransformStream` with `pipeThrough`/`pipeTo`
- `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval` — Zig timer heap
- `console.log/warn/error/debug/trace/assert/time/timeEnd/count/dir/group` — Erlang Logger
- `CompressionStream`, `DecompressionStream` — `:zlib`
- `Buffer` (encode, decode, byteLength) — `Base`, `:unicode`
- `EventTarget`, `Event`, `CustomEvent`, `MessageEvent`, `CloseEvent`, `ErrorEvent`
- `AbortController`, `AbortSignal`
- `Blob`, `File`
- `BroadcastChannel` — `:pg` (distributed across cluster)
- `WebSocket` — `:gun`
- `Worker` — BEAM process-backed JS workers with `postMessage`
- `navigator.locks` (Web Locks API) — GenServer with monitor-based cleanup
- `localStorage` — ETS (shared across runtimes)
- `EventSource` (Server-Sent Events) — `:httpc` streaming
- `DOMException`
- `atob`, `btoa` — Zig base64
- `structuredClone` — QuickJS serialization
- `queueMicrotask` — `JS_EnqueueJob`
- `performance.now` — nanosecond precision

### DOM

- Native DOM via lexbor C library
- Elixir-side DOM queries: `dom_find/2`, `dom_find_all/2`, `dom_text/2`, `dom_attr/3`, `dom_html/1`
- Returns Floki-compatible `{tag, attrs, children}` tuples

### TypeScript Toolchain

- `QuickBEAM.JS` — re-exports OXC parse, transform, minify, bundle
- `QuickBEAM.eval_ts/3` — evaluate TypeScript directly
- TypeScript sources compiled at build time via OXC (no Node.js/Bun required)
