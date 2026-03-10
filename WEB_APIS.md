# QuickBEAM Web APIs — Implementation Plan

## Core Principle

BEAM handles I/O, scheduling, and binary storage. JS gets standard Web APIs that
delegate to BEAM under the hood. The developer writes familiar JS but gets BEAM's
reliability and concurrency.

---

## Tier 1 — Pure Computation (Zig NIF, no BEAM round-trip)

### `TextEncoder` / `TextDecoder`

Encode strings to `Uint8Array`, decode `Uint8Array` to strings. QuickJS has
string ↔ bytes internally. Implement as C functions registered on the context.

```js
const encoder = new TextEncoder();
const bytes = encoder.encode("hello");     // Uint8Array
const decoder = new TextDecoder();
const text = decoder.decode(bytes);        // "hello"
```

### `atob()` / `btoa()`

Base64 encode/decode. Pure computation. Zig has `std.base64`.

### `queueMicrotask()`

Maps to `JS_EnqueueJob` which QuickJS already has.

### `structuredClone()`

QuickJS has `JS_WriteObject` / `JS_ReadObject` for serialization.

### `crypto.getRandomValues()`

Fill a TypedArray with random bytes. Zig has `std.crypto.random`.

### `performance.now()`

`std.time.nanoTimestamp()` relative to runtime start. Sub-millisecond precision.

---

## Tier 2 — Binary Bridge (iolist ↔ Blob)

### `Uint8Array` ↔ BEAM binary

- **BEAM → JS**: `JS_NewArrayBuffer` pointing at BEAM binary bytes. Free callback
  decrements refcount. Zero-copy when lifecycle permits.
- **JS → BEAM**: `JS_GetArrayBuffer` to get pointer, `enif_make_binary` to wrap.

### `Blob`

The Web API for immutable binary data — exactly what BEAM iolists are for.

```js
// Blob constructor accepts arrays of parts — just like iolists!
const blob = new Blob(["Hello, ", name, "!"], { type: "text/plain" });
const bytes = await blob.arrayBuffer();  // flattens to single ArrayBuffer
const text = await blob.text();          // decodes as UTF-8
```

Under the hood, `new Blob([...parts])` stores parts as a linked list (like an
iolist). `blob.arrayBuffer()` flattens only when requested (like
`:erlang.iolist_to_binary/1`).

| BEAM                             | JS                         |
|----------------------------------|----------------------------|
| `iolist` (nested binaries/chars) | `Blob` constructor parts   |
| `:erlang.iolist_to_binary/1`     | `blob.arrayBuffer()`       |
| `:erlang.iolist_size/1`          | `blob.size`                |
| binary sub-part                  | `blob.slice(start, end)`   |

---

## Tier 3 — URL

### `URL` / `URLSearchParams`

Pure parsing, no I/O. Useful for `fetch()` and general string manipulation.

```js
const url = new URL("https://example.com/path?q=hello");
url.searchParams.get("q");  // "hello"
url.pathname;                // "/path"
```

---

## Tier 4 — `fetch()` via BEAM

`fetch()` delegates to Erlang's `:httpc` (built-in, no deps).

```js
const resp = await fetch("https://api.example.com/users");
const users = await resp.json();
```

Under the hood:
1. `fetch(url, options)` → `beam.call("__quickbeam.fetch", url, options)`
2. GenServer dispatches to `:httpc`
3. Response returns as `{status, headers, body_binary}`
4. JS wraps in a `Response` object with `.json()`, `.text()`, `.arrayBuffer()`

The body binary transfers via the ArrayBuffer bridge — zero-copy from BEAM to JS.

### `Response`

```js
response.status       // number
response.ok           // status 200-299
response.statusText   // "OK", "Not Found", etc.
response.headers      // Headers object
response.url          // string

response.text()         // → Promise<string>
response.json()         // → Promise<parsed>
response.arrayBuffer()  // → Promise<ArrayBuffer>
response.blob()         // → Promise<Blob>
```

### `Headers`

Iterable Map-like object. Case-insensitive key lookup.

```js
response.headers.get("content-type")
response.headers.has("authorization")
for (const [key, value] of response.headers) { ... }
```

### `Request`

Constructor for building fetch requests:

```js
const req = new Request("https://api.example.com/users", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Alice" }),
});
const resp = await fetch(req);
```

### `AbortController` / `AbortSignal`

Cancellation for fetch and other async operations:

```js
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);
const resp = await fetch(url, { signal: controller.signal });
```

---

## Tier 5 — Streams

### `ReadableStream`

Maps to BEAM streaming patterns. Each `reader.read()` is a `beam.call` that
receives the next chunk from a BEAM-managed stream.

```js
const resp = await fetch("https://large-file.example.com/data.bin");
const reader = resp.body.getReader();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  processChunk(value);  // value is Uint8Array backed by BEAM binary
}
```

---

## Not Implementing

- **`WebSocket`** — use `beam.call` for BEAM-managed WS connections
- **`Worker`** / **`SharedWorker`** — BEAM processes ARE workers; use `beam.spawn()`
- **`localStorage`** / **`sessionStorage`** — use `beam.call` for ETS/DETS
- **`DOM`** — not applicable
- **`XMLHttpRequest`** — fetch is the standard

---

## Implementation Order

1. **TextEncoder/TextDecoder** + **atob/btoa** — pure NIF, Uint8Array ↔ string bridge
2. **Uint8Array ↔ BEAM binary bridge** — zero-copy in value conversion
3. **queueMicrotask** + **performance.now()** + **crypto.getRandomValues()** — small wins
4. **structuredClone()**
5. **URL / URLSearchParams** — pure parsing
6. **Headers / Response / Request** — fetch prerequisites
7. **fetch()** via beam.call + `:httpc` — the killer feature
8. **Blob** — iolist semantics
9. **AbortController / AbortSignal** — cancellation
10. **ReadableStream** — streaming from BEAM

---

## File Structure

Zig NIF is split into multiple files imported from the main module:

```
lib/quickbeam/
├── quickbeam.zig            # main: resource, message queue, NIF entry points
├── worker.zig               # event loop, WorkerState, eval/call/reset
├── js_bridge.zig            # beam.call, enif_send, term helpers
├── timers.zig               # setTimeout/setInterval/clearTimeout
├── console.zig              # console.log/warn/error
├── text_encoding.zig        # TextEncoder, TextDecoder, atob, btoa
├── web_crypto.zig           # crypto.getRandomValues
├── web_performance.zig      # performance.now
├── web_url.zig              # URL, URLSearchParams
├── web_fetch.zig            # fetch, Headers, Request, Response
├── web_blob.zig             # Blob
├── web_streams.zig          # ReadableStream
└── native.ex                # Zigler module declaration
```
