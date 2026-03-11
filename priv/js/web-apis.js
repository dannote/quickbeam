(() => {
  // priv/ts/dom-exception.ts
  class DOMException extends Error {
    code;
    constructor(message = "", name = "Error") {
      super(message);
      this.name = name;
      this.code = 0;
    }
  }

  // priv/ts/event.ts
  var SYM_STOP_IMMEDIATE = Symbol("stopImmediate");

  class Event {
    type;
    timeStamp;
    cancelBubble = false;
    #stopImmediatePropagationFlag = false;
    #defaultPrevented = false;
    constructor(type) {
      this.type = type;
      this.timeStamp = performance.now();
    }
    get defaultPrevented() {
      return this.#defaultPrevented;
    }
    preventDefault() {
      this.#defaultPrevented = true;
    }
    stopPropagation() {
      this.cancelBubble = true;
    }
    stopImmediatePropagation() {
      this.#stopImmediatePropagationFlag = true;
      this.cancelBubble = true;
    }
    get [SYM_STOP_IMMEDIATE]() {
      return this.#stopImmediatePropagationFlag;
    }
  }

  class MessageEvent extends Event {
    data;
    origin;
    lastEventId;
    constructor(type, init) {
      super(type);
      this.data = init?.data;
      this.origin = init?.origin ?? "";
      this.lastEventId = init?.lastEventId ?? "";
    }
  }

  class CloseEvent extends Event {
    code;
    reason;
    wasClean;
    constructor(type, init) {
      super(type);
      this.code = init?.code ?? 0;
      this.reason = init?.reason ?? "";
      this.wasClean = init?.wasClean ?? false;
    }
  }

  class ErrorEvent extends Event {
    message;
    error;
    constructor(type, init) {
      super(type);
      this.message = init?.message ?? "";
      this.error = init?.error;
    }
  }

  // priv/ts/event-target.ts
  class EventTarget {
    #listeners = new Map;
    addEventListener(type, callback, options) {
      if (callback === null)
        return;
      const once = typeof options === "object" ? options.once ?? false : false;
      const signal = typeof options === "object" ? options.signal : undefined;
      const list = this.#listeners.get(type);
      if (list) {
        for (const entry2 of list) {
          if (entry2.callback === callback)
            return;
        }
      }
      const entry = { callback, once, signal };
      if (signal?.aborted)
        return;
      signal?.addEventListener("abort", () => {
        this.removeEventListener(type, callback);
      });
      if (list) {
        list.push(entry);
      } else {
        this.#listeners.set(type, [entry]);
      }
    }
    removeEventListener(type, callback) {
      if (callback === null)
        return;
      const list = this.#listeners.get(type);
      if (!list)
        return;
      for (let i = 0;i < list.length; i++) {
        if (list[i].callback === callback) {
          list[i]._removed = true;
          list.splice(i, 1);
          break;
        }
      }
      if (list.length === 0)
        this.#listeners.delete(type);
    }
    dispatchEvent(event) {
      const list = this.#listeners.get(event.type);
      if (!list)
        return !event.defaultPrevented;
      const snapshot = list.slice();
      for (const entry of snapshot) {
        if (entry._removed)
          continue;
        if (event[SYM_STOP_IMMEDIATE])
          break;
        if (typeof entry.callback === "function") {
          entry.callback(event);
        } else {
          entry.callback.handleEvent(event);
        }
        if (entry.once) {
          this.removeEventListener(event.type, entry.callback);
        }
      }
      return !event.defaultPrevented;
    }
  }

  // priv/ts/abort.ts
  var SYM_ABORT = Symbol("abort");
  class AbortSignal extends EventTarget {
    #aborted = false;
    #reason = undefined;
    onabort = null;
    get aborted() {
      return this.#aborted;
    }
    get reason() {
      return this.#reason;
    }
    throwIfAborted() {
      if (this.#aborted)
        throw this.#reason;
    }
    [SYM_ABORT](reason) {
      if (this.#aborted)
        return;
      this.#aborted = true;
      this.#reason = reason ?? new DOMException("The operation was aborted.", "AbortError");
      const event = new Event("abort");
      this.onabort?.(event);
      this.dispatchEvent(event);
    }
    static timeout(ms) {
      const controller = new AbortController;
      setTimeout(() => controller.abort(new DOMException("The operation timed out.", "TimeoutError")), ms);
      return controller.signal;
    }
    static abort(reason) {
      const s = new AbortSignal;
      s[SYM_ABORT](reason);
      return s;
    }
    static any(signals) {
      const controller = new AbortController;
      for (const s of signals) {
        if (s.aborted) {
          controller.abort(s.reason);
          return controller.signal;
        }
        s.addEventListener("abort", () => controller.abort(s.reason), { once: true });
      }
      return controller.signal;
    }
  }

  class AbortController {
    #signal = new AbortSignal;
    get signal() {
      return this.#signal;
    }
    abort(reason) {
      this.#signal[SYM_ABORT](reason);
    }
  }

  // priv/ts/streams.ts
  var SYM_READ = Symbol("read");
  var SYM_RELEASE = Symbol("releaseLock");
  var SYM_CANCEL = Symbol("cancel");

  class ReadableStream {
    #queue = [];
    #state = "readable";
    #storedError = undefined;
    #source;
    #controller;
    #pulling = false;
    #waitingReaders = [];
    #locked = false;
    constructor(source) {
      this.#source = source;
      const controller = {
        desiredSize: 1,
        enqueue: (chunk) => {
          if (this.#state !== "readable")
            return;
          if (this.#waitingReaders.length > 0) {
            const reader = this.#waitingReaders.shift();
            if (reader)
              reader.resolve({ value: chunk, done: false });
            return;
          }
          this.#queue.push(chunk);
        },
        close: () => {
          if (this.#state !== "readable")
            return;
          this.#state = "closed";
          for (const reader of this.#waitingReaders) {
            reader.resolve({ value: undefined, done: true });
          }
          this.#waitingReaders = [];
        },
        error: (e) => {
          if (this.#state !== "readable")
            return;
          this.#state = "errored";
          this.#storedError = e;
          for (const reader of this.#waitingReaders) {
            reader.reject(e);
          }
          this.#waitingReaders = [];
          this.#queue = [];
        }
      };
      this.#controller = controller;
      try {
        const result = source?.start?.(controller);
        if (result instanceof Promise) {
          result.catch((e) => controller.error(e));
        }
      } catch (e) {
        controller.error(e);
      }
    }
    get locked() {
      return this.#locked;
    }
    getReader() {
      if (this.#locked)
        throw new TypeError("ReadableStream is already locked");
      this.#locked = true;
      return new ReadableStreamDefaultReader(this);
    }
    async cancel(reason) {
      if (this.#locked)
        throw new TypeError("Cannot cancel a locked stream");
      await this.#source?.cancel?.(reason);
      this.#state = "closed";
      this.#queue = [];
    }
    pipeThrough(transform) {
      this.pipeTo(transform.writable);
      return transform.readable;
    }
    async pipeTo(dest) {
      const reader = this.getReader();
      const writer = dest.getWriter();
      try {
        for (;; ) {
          const { value, done } = await reader.read();
          if (done)
            break;
          await writer.write(value);
        }
        await writer.close();
      } catch (e) {
        await writer.abort(e);
      } finally {
        reader.releaseLock();
      }
    }
    tee() {
      const reader = this.getReader();
      let cancelled1 = false;
      let cancelled2 = false;
      let ctrl2;
      const stream1 = new ReadableStream({
        pull(controller) {
          return reader.read().then(({ value, done }) => {
            if (done) {
              if (!cancelled1)
                controller.close();
              if (!cancelled2)
                ctrl2.close();
              return;
            }
            if (!cancelled1)
              controller.enqueue(value);
            if (!cancelled2)
              ctrl2.enqueue(value);
          });
        },
        cancel() {
          cancelled1 = true;
        }
      });
      const stream2 = new ReadableStream({
        start(controller) {
          ctrl2 = controller;
        },
        cancel() {
          cancelled2 = true;
        }
      });
      return [stream1, stream2];
    }
    static from(iterable) {
      return new ReadableStream({
        async start(controller) {
          for await (const chunk of iterable) {
            controller.enqueue(chunk);
          }
          controller.close();
        }
      });
    }
    [SYM_READ]() {
      if (this.#state === "errored")
        return Promise.reject(this.#storedError);
      if (this.#queue.length > 0) {
        const value = this.#queue.shift();
        this.#callPull();
        return Promise.resolve({ value, done: false });
      }
      if (this.#state === "closed") {
        return Promise.resolve({ value: undefined, done: true });
      }
      this.#callPull();
      return new Promise((resolve, reject) => {
        this.#waitingReaders.push({ resolve, reject });
      });
    }
    [SYM_RELEASE]() {
      this.#locked = false;
    }
    [SYM_CANCEL](reason) {
      const result = this.#source?.cancel?.(reason);
      return result instanceof Promise ? result : Promise.resolve();
    }
    #callPull() {
      if (this.#pulling || this.#state !== "readable" || !this.#source?.pull)
        return;
      this.#pulling = true;
      try {
        const result = this.#source.pull(this.#controller);
        if (result instanceof Promise) {
          result.then(() => {
            this.#pulling = false;
          }).catch((e) => {
            this.#pulling = false;
            this.#controller.error(e);
          });
        } else {
          this.#pulling = false;
        }
      } catch (e) {
        this.#pulling = false;
        this.#controller.error(e);
      }
    }
    async* [Symbol.asyncIterator]() {
      const reader = this.getReader();
      try {
        for (;; ) {
          const { value, done } = await reader.read();
          if (done)
            break;
          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    }
  }

  class ReadableStreamDefaultReader {
    #stream;
    #closed;
    #closedResolve;
    constructor(stream) {
      this.#stream = stream;
      this.#closed = new Promise((resolve) => {
        this.#closedResolve = resolve;
      });
    }
    get closed() {
      return this.#closed;
    }
    read() {
      return this.#stream[SYM_READ]();
    }
    releaseLock() {
      this.#stream[SYM_RELEASE]();
      this.#closedResolve();
    }
    async cancel(reason) {
      await this.#stream[SYM_CANCEL](reason);
      this.releaseLock();
    }
  }

  class WritableStream {
    #sink;
    #state = "writable";
    #storedError = undefined;
    #locked = false;
    #controller;
    #closeResolve;
    #closeReject;
    #abortController = new AbortController;
    constructor(sink) {
      this.#sink = sink;
      const ac = this.#abortController;
      const controller = {
        get signal() {
          return ac.signal;
        },
        error: (e) => {
          if (this.#state !== "writable")
            return;
          this.#state = "errored";
          this.#storedError = e;
          this.#closeReject?.(e);
        }
      };
      this.#controller = controller;
      try {
        const result = sink?.start?.(controller);
        if (result instanceof Promise) {
          result.catch((e) => controller.error(e));
        }
      } catch (e) {
        controller.error(e);
      }
    }
    get locked() {
      return this.#locked;
    }
    async abort(reason) {
      if (this.#locked)
        throw new TypeError("Cannot abort a locked stream");
      this.#abortController.abort(reason);
      await this.#sink?.abort?.(reason);
      this.#state = "errored";
      this.#storedError = reason;
    }
    async close() {
      if (this.#locked)
        throw new TypeError("Cannot close a locked stream");
      if (this.#state !== "writable")
        throw new TypeError("Stream is not writable");
      await this.#sink?.close?.();
      this.#state = "closed";
    }
    getWriter() {
      if (this.#locked)
        throw new TypeError("WritableStream is already locked");
      this.#locked = true;
      return new WritableStreamDefaultWriter(this);
    }
    _write(chunk) {
      if (this.#state !== "writable") {
        return Promise.reject(this.#storedError ?? new TypeError("Stream is not writable"));
      }
      const r = this.#sink?.write?.(chunk, this.#controller);
      return r instanceof Promise ? r : Promise.resolve();
    }
    async _close() {
      if (this.#state !== "writable")
        return;
      await this.#sink?.close?.();
      this.#state = "closed";
      this.#closeResolve?.();
    }
    async _abort(reason) {
      this.#abortController.abort(reason);
      await this.#sink?.abort?.(reason);
      this.#state = "errored";
      this.#storedError = reason;
      this.#closeReject?.(reason);
    }
    _releaseLock() {
      this.#locked = false;
    }
    _closed() {
      if (this.#state === "closed")
        return Promise.resolve();
      if (this.#state === "errored")
        return Promise.reject(this.#storedError);
      return new Promise((resolve, reject) => {
        this.#closeResolve = resolve;
        this.#closeReject = reject;
      });
    }
    _desiredSize() {
      return this.#state === "writable" ? 1 : 0;
    }
    _ready() {
      return this.#state === "writable" ? Promise.resolve() : Promise.reject(this.#storedError);
    }
  }

  class WritableStreamDefaultWriter {
    #stream;
    #closedPromise;
    constructor(stream) {
      this.#stream = stream;
      this.#closedPromise = stream._closed();
    }
    get closed() {
      return this.#closedPromise;
    }
    get desiredSize() {
      return this.#stream._desiredSize();
    }
    get ready() {
      return this.#stream._ready();
    }
    async write(chunk) {
      await this.#stream._write(chunk);
    }
    async close() {
      await this.#stream._close();
      this.releaseLock();
    }
    async abort(reason) {
      await this.#stream._abort(reason);
      this.releaseLock();
    }
    releaseLock() {
      this.#stream._releaseLock();
    }
  }

  class TransformStream {
    readable;
    writable;
    constructor(transformer) {
      let readableController;
      this.readable = new ReadableStream({
        start(controller) {
          readableController = controller;
        }
      });
      const ctrl = {
        enqueue(chunk) {
          readableController.enqueue(chunk);
        },
        error(reason) {
          readableController.error(reason);
        },
        terminate() {
          readableController.close();
        },
        get desiredSize() {
          return readableController.desiredSize;
        }
      };
      try {
        const startResult = transformer?.start?.(ctrl);
        if (startResult instanceof Promise) {
          startResult.catch((e) => readableController.error(e));
        }
      } catch (e) {
        readableController.error(e);
      }
      this.writable = new WritableStream({
        async write(chunk) {
          if (transformer?.transform) {
            await transformer.transform(chunk, ctrl);
          } else {
            ctrl.enqueue(chunk);
          }
        },
        async close() {
          if (transformer?.flush)
            await transformer.flush(ctrl);
          ctrl.terminate();
        },
        abort(reason) {
          ctrl.error(reason);
        }
      });
    }
  }

  // priv/ts/blob.ts
  var SYM_BYTES = Symbol("bytes");
  function normalizePart(part) {
    if (part instanceof Uint8Array)
      return part;
    if (part instanceof ArrayBuffer)
      return new Uint8Array(part);
    if (part instanceof DataView)
      return new Uint8Array(part.buffer, part.byteOffset, part.byteLength);
    if (part instanceof Blob)
      return part[SYM_BYTES]();
    if (typeof part === "string")
      return new TextEncoder().encode(part);
    return new Uint8Array(0);
  }
  function concatBytes(parts) {
    if (parts.length === 0)
      return new Uint8Array(0);
    if (parts.length === 1)
      return parts[0];
    let total = 0;
    for (const p of parts)
      total += p.length;
    const result = new Uint8Array(total);
    let offset = 0;
    for (const p of parts) {
      result.set(p, offset);
      offset += p.length;
    }
    return result;
  }
  function clampIndex(idx, size) {
    if (idx < 0)
      return Math.max(size + idx, 0);
    return Math.min(idx, size);
  }
  function normalizeType(raw) {
    return /^[\x20-\x7E]*$/.test(raw) ? raw.toLowerCase() : "";
  }

  class Blob {
    #parts;
    #type;
    constructor(parts, options) {
      this.#type = normalizeType(options?.type ?? "");
      this.#parts = (parts ?? []).map(normalizePart);
    }
    get size() {
      let total = 0;
      for (const p of this.#parts)
        total += p.length;
      return total;
    }
    get type() {
      return this.#type;
    }
    async arrayBuffer() {
      return this[SYM_BYTES]().buffer;
    }
    async text() {
      return new TextDecoder().decode(this[SYM_BYTES]());
    }
    async bytes() {
      return this[SYM_BYTES]();
    }
    slice(start, end, contentType) {
      const bytes = this[SYM_BYTES]();
      const s = clampIndex(start ?? 0, bytes.length);
      const e = clampIndex(end ?? bytes.length, bytes.length);
      return new Blob([bytes.slice(s, Math.max(s, e))], {
        type: normalizeType(contentType ?? "")
      });
    }
    stream() {
      const bytes = this[SYM_BYTES]();
      return new ReadableStream({
        start(controller) {
          if (bytes.length > 0)
            controller.enqueue(bytes);
          controller.close();
        }
      });
    }
    [SYM_BYTES]() {
      return concatBytes(this.#parts);
    }
  }

  class File extends Blob {
    name;
    lastModified;
    constructor(parts, name, options) {
      super(parts, options);
      this.name = name;
      this.lastModified = options?.lastModified ?? Date.now();
    }
  }

  // priv/ts/broadcast-channel.ts
  var SYM_RECEIVE = Symbol("receive");
  var channelRegistry = new Map;

  class BroadcastChannel extends EventTarget {
    name;
    #closed = false;
    onmessage = null;
    onmessageerror = null;
    constructor(name) {
      super();
      this.name = name;
      let set = channelRegistry.get(name);
      if (!set) {
        set = new Set;
        channelRegistry.set(name, set);
      }
      set.add(this);
      beam.callSync("__broadcast_join", name);
    }
    postMessage(message) {
      if (this.#closed)
        throw new DOMException("BroadcastChannel is closed", "InvalidStateError");
      beam.call("__broadcast_post", this.name, structuredClone(message));
    }
    close() {
      if (this.#closed)
        return;
      this.#closed = true;
      const set = channelRegistry.get(this.name);
      if (set) {
        set.delete(this);
        if (set.size === 0)
          channelRegistry.delete(this.name);
      }
      beam.callSync("__broadcast_leave", this.name);
    }
    [SYM_RECEIVE](data) {
      if (this.#closed)
        return;
      const event = new MessageEvent("message", { data });
      this.onmessage?.(event);
      this.dispatchEvent(event);
    }
  }
  globalThis.__qb_broadcast_dispatch = (channel, data) => {
    const set = channelRegistry.get(channel);
    if (!set)
      return;
    for (const ch of set)
      ch[SYM_RECEIVE](data);
  };

  // priv/ts/event-source.ts
  var eventSourceRegistry = new Map;

  class EventSource extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 2;
    CONNECTING = 0;
    OPEN = 1;
    CLOSED = 2;
    url;
    withCredentials = false;
    readyState = 0;
    onopen = null;
    onmessage = null;
    onerror = null;
    #taskPid = null;
    #id;
    #lastEventId = "";
    constructor(url) {
      super();
      this.url = url;
      this.#id = String(Math.random()).slice(2);
      eventSourceRegistry.set(this.#id, this);
      this.#taskPid = beam.callSync("__eventsource_open", url, this.#id);
    }
    get lastEventId() {
      return this.#lastEventId;
    }
    close() {
      if (this.readyState === 2)
        return;
      this.readyState = 2;
      eventSourceRegistry.delete(this.#id);
      if (this.#taskPid) {
        beam.call("__eventsource_close", this.#taskPid);
      }
    }
    _onOpen() {
      this.readyState = 1;
      const event = new Event("open");
      this.dispatchEvent(event);
      this.onopen?.(event);
    }
    _onEvent(type, data, id) {
      if (id !== null)
        this.#lastEventId = id;
      const event = new MessageEvent(type, { data, lastEventId: this.#lastEventId });
      this.dispatchEvent(event);
      if (type === "message") {
        this.onmessage?.(event);
      }
    }
    _onError(reason) {
      this.readyState = 2;
      const event = new ErrorEvent("error", { message: reason });
      this.dispatchEvent(event);
      this.onerror?.(event);
    }
  }
  __qb_register_dispatcher((msg) => {
    if (!Array.isArray(msg))
      return false;
    const [type, id, ...rest] = msg;
    if (typeof id !== "string")
      return false;
    const source = eventSourceRegistry.get(id);
    if (!source)
      return false;
    if (type === "__eventsource_open") {
      source._onOpen();
      return true;
    }
    if (type === "__eventsource_event") {
      const [eventType, data, eventId] = rest;
      source._onEvent(eventType, data, eventId);
      return true;
    }
    if (type === "__eventsource_error") {
      source._onError(rest[0]);
      return true;
    }
    return false;
  });

  // priv/ts/headers.ts
  class Headers {
    #map = new Map;
    constructor(init) {
      if (init instanceof Headers) {
        for (const [name, value] of init)
          this.append(name, value);
      } else if (Array.isArray(init)) {
        for (const pair of init)
          this.append(pair[0], pair[1]);
      } else if (init) {
        for (const key of Object.keys(init))
          this.append(key, init[key]);
      }
    }
    append(name, value) {
      const key = name.toLowerCase();
      const existing = this.#map.get(key);
      if (existing) {
        existing.push(value);
      } else {
        this.#map.set(key, [value]);
      }
    }
    get(name) {
      const values = this.#map.get(name.toLowerCase());
      return values ? values.join(", ") : null;
    }
    getSetCookie() {
      return this.#map.get("set-cookie")?.slice() ?? [];
    }
    set(name, value) {
      this.#map.set(name.toLowerCase(), [value]);
    }
    delete(name) {
      this.#map.delete(name.toLowerCase());
    }
    has(name) {
      return this.#map.has(name.toLowerCase());
    }
    forEach(callback, thisArg) {
      for (const [name, value] of this) {
        callback.call(thisArg, value, name, this);
      }
    }
    *entries() {
      const keys = [...this.#map.keys()].sort();
      for (const key of keys) {
        yield [key, this.#map.get(key)?.join(", ") ?? ""];
      }
    }
    *keys() {
      const keys = [...this.#map.keys()].sort();
      for (const key of keys)
        yield key;
    }
    *values() {
      const keys = [...this.#map.keys()].sort();
      for (const key of keys)
        yield this.#map.get(key)?.join(", ") ?? "";
    }
    [Symbol.iterator]() {
      return this.entries();
    }
  }

  // priv/ts/fetch.ts
  async function bodyToBytes(body) {
    if (typeof body === "string") {
      return { bytes: new TextEncoder().encode(body), contentType: "text/plain;charset=UTF-8" };
    }
    if (body instanceof Uint8Array) {
      return { bytes: body, contentType: null };
    }
    if (body instanceof ArrayBuffer) {
      return { bytes: new Uint8Array(body), contentType: null };
    }
    if (body instanceof Blob) {
      return { bytes: body[SYM_BYTES](), contentType: body.type || null };
    }
    if (body instanceof URLSearchParams) {
      return {
        bytes: new TextEncoder().encode(body.toString()),
        contentType: "application/x-www-form-urlencoded;charset=UTF-8"
      };
    }
    if (body instanceof ReadableStream) {
      const reader = body.getReader();
      const chunks = [];
      for (;; ) {
        const { value, done } = await reader.read();
        if (done)
          break;
        chunks.push(value instanceof Uint8Array ? value : new Uint8Array(value));
      }
      let total = 0;
      for (const c of chunks)
        total += c.length;
      const result = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        result.set(c, offset);
        offset += c.length;
      }
      return { bytes: result, contentType: null };
    }
    return { bytes: null, contentType: null };
  }

  class Request {
    url;
    method;
    headers;
    body;
    signal;
    redirect;
    constructor(input, init) {
      const isClone = input instanceof Request;
      this.url = isClone ? input.url : input;
      this.method = (init?.method ?? (isClone ? input.method : "GET")).toUpperCase();
      this.headers = new Headers(init?.headers ?? (isClone ? input.headers : undefined));
      if (init?.body !== undefined)
        this.body = init.body;
      else
        this.body = isClone ? input.body : null;
      this.signal = init?.signal ?? (isClone ? input.signal : new AbortSignal);
      this.redirect = init?.redirect ?? (isClone ? input.redirect : "follow");
    }
    clone() {
      return new Request(this);
    }
  }

  class Response {
    status;
    statusText;
    headers;
    url;
    redirected;
    type = "basic";
    #body;
    #bodyUsed = false;
    constructor(body, init) {
      this.#body = body;
      this.status = init.status;
      this.statusText = init.statusText;
      this.headers = init.headers;
      this.url = init.url;
      this.redirected = init.redirected ?? false;
    }
    get ok() {
      return this.status >= 200 && this.status < 300;
    }
    get bodyUsed() {
      return this.#bodyUsed;
    }
    get body() {
      if (this.#body === null)
        return null;
      const bytes = this.#body;
      return new ReadableStream({
        start(controller) {
          if (bytes.length > 0)
            controller.enqueue(bytes);
          controller.close();
        }
      });
    }
    #consumeBody() {
      if (this.#bodyUsed)
        throw new TypeError("Body already consumed");
      this.#bodyUsed = true;
      return this.#body ?? new Uint8Array(0);
    }
    async arrayBuffer() {
      return this.#consumeBody().buffer;
    }
    async bytes() {
      return this.#consumeBody();
    }
    async text() {
      return new TextDecoder().decode(this.#consumeBody());
    }
    async json() {
      return JSON.parse(await this.text());
    }
    async blob() {
      const bytes = this.#consumeBody();
      return new Blob([bytes], { type: this.headers.get("content-type") ?? "" });
    }
    clone() {
      if (this.#bodyUsed)
        throw new TypeError("Cannot clone a used response");
      return new Response(this.#body ? this.#body.slice() : null, {
        status: this.status,
        statusText: this.statusText,
        headers: new Headers(this.headers),
        url: this.url,
        redirected: this.redirected
      });
    }
    static error() {
      return new Response(null, {
        status: 0,
        statusText: "",
        headers: new Headers,
        url: ""
      });
    }
    static redirect(url, status = 302) {
      const headers = new Headers([["location", url]]);
      return new Response(null, { status, statusText: "", headers, url: "" });
    }
    static json(data, init) {
      const body = new TextEncoder().encode(JSON.stringify(data));
      const headers = new Headers(init?.headers);
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
      return new Response(body, { status: init?.status ?? 200, statusText: "", headers, url: "" });
    }
  }
  async function fetchImpl(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    request.signal.throwIfAborted();
    let resolvedBody = null;
    let bodyContentType = null;
    if (request.body !== null) {
      const { bytes, contentType } = await bodyToBytes(request.body);
      resolvedBody = bytes;
      bodyContentType = contentType;
    }
    if (bodyContentType && !request.headers.has("content-type")) {
      request.headers.set("content-type", bodyContentType);
    }
    const payload = {
      url: request.url,
      method: request.method,
      headers: [...request.headers.entries()],
      body: resolvedBody,
      redirect: request.redirect
    };
    const resultPromise = beam.call("__fetch", payload);
    const abortPromise = new Promise((_, reject) => {
      if (request.signal.aborted) {
        reject(request.signal.reason);
        return;
      }
      request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true });
    });
    const result = await Promise.race([resultPromise, abortPromise]);
    return new Response(result.body instanceof Uint8Array ? result.body : null, {
      status: result.status,
      statusText: result.statusText,
      headers: new Headers(result.headers),
      url: result.url || request.url,
      redirected: result.redirected
    });
  }

  // priv/ts/text-streams.ts
  class TextEncoderStream extends TransformStream {
    encoding = "utf-8";
    constructor() {
      const encoder = new TextEncoder;
      super({
        transform(chunk, controller) {
          controller.enqueue(encoder.encode(chunk));
        }
      });
    }
  }

  class TextDecoderStream extends TransformStream {
    encoding;
    fatal;
    ignoreBOM;
    constructor(label = "utf-8", options) {
      const decoder = new TextDecoder(label, options);
      super({
        transform(chunk, controller) {
          const input = chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : chunk;
          controller.enqueue(decoder.decode(input, { stream: true }));
        },
        flush(controller) {
          const final = decoder.decode();
          if (final)
            controller.enqueue(final);
        }
      });
      this.encoding = decoder.encoding;
      this.fatal = decoder.fatal;
      this.ignoreBOM = decoder.ignoreBOM;
    }
  }

  // priv/ts/websocket.ts
  var SYM_HANDLE_EVENT = Symbol("handleEvent");

  class WebSocket extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    CONNECTING = 0;
    OPEN = 1;
    CLOSING = 2;
    CLOSED = 3;
    url;
    extensions = "";
    #readyState = WebSocket.CONNECTING;
    #protocol = "";
    #binaryType = "blob";
    #bufferedAmount = 0;
    #id;
    onopen = null;
    onmessage = null;
    onclose = null;
    onerror = null;
    constructor(url, protocols) {
      super();
      this.url = url;
      let protoArray = [];
      if (typeof protocols === "string")
        protoArray = [protocols];
      else if (protocols)
        protoArray = protocols;
      this.#id = beam.callSync("__ws_connect", url, protoArray);
    }
    get readyState() {
      return this.#readyState;
    }
    get protocol() {
      return this.#protocol;
    }
    get binaryType() {
      return this.#binaryType;
    }
    set binaryType(value) {
      this.#binaryType = value;
    }
    get bufferedAmount() {
      return this.#bufferedAmount;
    }
    send(data) {
      if (this.#readyState === WebSocket.CONNECTING) {
        throw new DOMException("WebSocket is not open: readyState 0 (CONNECTING)", "InvalidStateError");
      }
      if (this.#readyState !== WebSocket.OPEN)
        return;
      let payload;
      if (typeof data === "string") {
        payload = data;
      } else if (data instanceof Uint8Array) {
        payload = data;
      } else if (data instanceof ArrayBuffer) {
        payload = new Uint8Array(data);
      } else if (data instanceof Blob) {
        payload = data[SYM_BYTES]();
      } else {
        payload = JSON.stringify(data);
      }
      beam.call("__ws_send", this.#id, payload);
    }
    close(code, reason) {
      if (this.#readyState === WebSocket.CLOSING || this.#readyState === WebSocket.CLOSED)
        return;
      if (code !== undefined && code !== 1000 && (code < 3000 || code > 4999)) {
        throw new DOMException(`The code must be either 1000, or between 3000 and 4999. ${code} is neither.`, "InvalidAccessError");
      }
      this.#readyState = WebSocket.CLOSING;
      beam.call("__ws_close", this.#id, code ?? 1000, reason ?? "");
    }
    [SYM_HANDLE_EVENT](type, detail) {
      switch (type) {
        case "open":
          this.#readyState = WebSocket.OPEN;
          this.#protocol = detail?.protocol ?? "";
          {
            const ev = new Event("open");
            this.onopen?.(ev);
            this.dispatchEvent(ev);
          }
          break;
        case "message": {
          let messageData = detail?.data;
          if (this.#binaryType === "arraybuffer" && messageData instanceof Uint8Array) {
            messageData = messageData.buffer;
          }
          const ev = new MessageEvent("message", { data: messageData });
          this.onmessage?.(ev);
          this.dispatchEvent(ev);
          break;
        }
        case "close": {
          this.#readyState = WebSocket.CLOSED;
          const ev = new CloseEvent("close", {
            code: detail?.code ?? 1006,
            reason: detail?.reason ?? "",
            wasClean: detail?.wasClean ?? false
          });
          this.onclose?.(ev);
          this.dispatchEvent(ev);
          break;
        }
        case "error": {
          const ev = new Event("error");
          this.onerror?.(ev);
          this.dispatchEvent(ev);
          break;
        }
      }
    }
  }

  // priv/ts/worker.ts
  var workerRegistry = new Map;

  class Worker extends EventTarget {
    #pid;
    #terminated = false;
    #earlyMessages = [];
    #onmessage = null;
    onerror = null;
    constructor(script) {
      super();
      this.#pid = beam.callSync("__worker_spawn", script);
      const pidKey = JSON.stringify(this.#pid);
      workerRegistry.set(pidKey, this);
    }
    get onmessage() {
      return this.#onmessage;
    }
    set onmessage(handler) {
      this.#onmessage = handler;
      if (handler && this.#earlyMessages.length > 0) {
        const queued = this.#earlyMessages.splice(0);
        for (const data of queued) {
          this._dispatch(data);
        }
      }
    }
    postMessage(data) {
      if (this.#terminated)
        throw new DOMException("Worker has been terminated", "InvalidStateError");
      beam.call("__worker_post", this.#pid, data);
    }
    terminate() {
      if (this.#terminated)
        return;
      this.#terminated = true;
      const pidKey = JSON.stringify(this.#pid);
      workerRegistry.delete(pidKey);
      beam.call("__worker_terminate", this.#pid);
    }
    _dispatch(data) {
      if (!this.#onmessage) {
        this.#earlyMessages.push(data);
        return;
      }
      const event = new MessageEvent("message", { data });
      this.dispatchEvent(event);
      this.#onmessage({ data });
    }
    _error(message, error) {
      const event = new ErrorEvent("error", { message });
      this.dispatchEvent(event);
      this.onerror?.({ message, error });
    }
  }
  __qb_register_dispatcher((msg) => {
    if (!Array.isArray(msg) || msg.length < 3)
      return false;
    const [type, pid, payload] = msg;
    if (type !== "__worker_msg" && type !== "__worker_err")
      return false;
    const pidKey = JSON.stringify(pid);
    const worker = workerRegistry.get(pidKey);
    if (!worker)
      return false;
    if (type === "__worker_msg") {
      worker._dispatch(payload);
    } else {
      worker._error(String(payload), payload);
    }
    return true;
  });

  // priv/ts/console-ext.ts
  var timers = new Map;
  var counters = new Map;
  console.debug = console.log;
  console.trace = (...args) => {
    const err = new Error;
    const stack = err.stack?.split(`
`).slice(2).join(`
`) ?? "";
    console.log("Trace:", ...args, `
` + stack);
  };
  console.assert = (condition, ...args) => {
    if (!condition) {
      console.error("Assertion failed:", ...args);
    }
  };
  console.time = (label = "default") => {
    timers.set(label, performance.now());
  };
  console.timeLog = (label = "default", ...args) => {
    const start = timers.get(label);
    if (start === undefined) {
      console.warn(`Timer '${label}' does not exist`);
      return;
    }
    const elapsed = performance.now() - start;
    console.log(`${label}: ${elapsed.toFixed(3)}ms`, ...args);
  };
  console.timeEnd = (label = "default") => {
    const start = timers.get(label);
    if (start === undefined) {
      console.warn(`Timer '${label}' does not exist`);
      return;
    }
    const elapsed = performance.now() - start;
    timers.delete(label);
    console.log(`${label}: ${elapsed.toFixed(3)}ms`);
  };
  console.count = (label = "default") => {
    const c = (counters.get(label) ?? 0) + 1;
    counters.set(label, c);
    console.log(`${label}: ${c}`);
  };
  console.countReset = (label = "default") => {
    counters.delete(label);
  };
  console.dir = (obj) => {
    try {
      console.log(JSON.stringify(obj, null, 2));
    } catch {
      console.log(String(obj));
    }
  };
  console.group = (...args) => {
    if (args.length > 0)
      console.log(...args);
  };
  console.groupEnd = () => {};

  // priv/ts/locks.ts
  class LockManager {
    async request(name, callbackOrOptions, maybeCallback) {
      let options = {};
      let callback;
      if (typeof callbackOrOptions === "function") {
        callback = callbackOrOptions;
      } else {
        options = callbackOrOptions;
        if (!maybeCallback)
          throw new TypeError("callback is required");
        callback = maybeCallback;
      }
      const mode = options.mode ?? "exclusive";
      const ifAvailable = options.ifAvailable ?? false;
      if (options.signal?.aborted) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }
      const result = await beam.call("__locks_request", name, mode, ifAvailable);
      if (result === "not_available") {
        return await callback(null);
      }
      if (result === "holder_down") {
        throw new DOMException("Lock holder terminated", "AbortError");
      }
      const lock = { name, mode };
      try {
        return await callback(lock);
      } finally {
        await beam.call("__locks_release", name);
      }
    }
    async query() {
      return await beam.call("__locks_query");
    }
  }
  var lockManager = new LockManager;
  var g = globalThis;
  g.navigator = g.navigator ?? {};
  g.navigator.locks = lockManager;

  // priv/ts/storage.ts
  class WebStorage {
    getItem(key) {
      return beam.callSync("__storage_get", String(key));
    }
    setItem(key, value) {
      beam.callSync("__storage_set", String(key), String(value));
    }
    removeItem(key) {
      beam.callSync("__storage_remove", String(key));
    }
    clear() {
      beam.callSync("__storage_clear");
    }
    key(index) {
      return beam.callSync("__storage_key", index);
    }
    get length() {
      return beam.callSync("__storage_length");
    }
  }
  globalThis.localStorage = new WebStorage;

  // priv/ts/web-apis.ts
  Object.assign(globalThis, {
    DOMException,
    Event,
    MessageEvent,
    CloseEvent,
    ErrorEvent,
    EventTarget,
    AbortSignal,
    AbortController,
    ReadableStream,
    ReadableStreamDefaultReader,
    WritableStream,
    WritableStreamDefaultWriter,
    TransformStream,
    TextEncoderStream,
    TextDecoderStream,
    Blob,
    File,
    Headers,
    Request,
    Response,
    fetch: fetchImpl,
    BroadcastChannel,
    WebSocket,
    Worker,
    EventSource
  });
})();
