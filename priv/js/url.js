(() => {
  // priv/ts/url.ts
  var ORIGIN_SCHEMES = ["http:", "https:", "ftp:", "ws:", "wss:"];

  class QBURLSearchParams {
    #entries;
    _url = null;
    constructor(init) {
      if (typeof init === "string") {
        const qs = init.startsWith("?") ? init.slice(1) : init;
        this.#entries = qs === "" ? [] : beam.callSync("__url_dissect_query", qs);
      } else if (Array.isArray(init)) {
        this.#entries = init.map((pair) => {
          if (pair.length !== 2) {
            throw new TypeError("Each pair must be an iterable with exactly two elements");
          }
          return [String(pair[0]), String(pair[1])];
        });
      } else if (init !== undefined) {
        this.#entries = Object.keys(init).map((k) => [k, String(init[k])]);
      } else {
        this.#entries = [];
      }
    }
    append(name, value) {
      this.#entries.push([String(name), String(value)]);
      this.#update();
    }
    delete(name, value) {
      if (value !== undefined) {
        const v = String(value);
        this.#entries = this.#entries.filter((e) => !(e[0] === name && e[1] === v));
      } else {
        this.#entries = this.#entries.filter((e) => e[0] !== name);
      }
      this.#update();
    }
    get(name) {
      const entry = this.#entries.find((e) => e[0] === name);
      return entry ? entry[1] : null;
    }
    getAll(name) {
      return this.#entries.filter((e) => e[0] === name).map((e) => e[1]);
    }
    has(name, value) {
      if (value !== undefined) {
        const v = String(value);
        return this.#entries.some((e) => e[0] === name && e[1] === v);
      }
      return this.#entries.some((e) => e[0] === name);
    }
    set(name, value) {
      const n = String(name);
      const v = String(value);
      const idx = this.#entries.findIndex((e) => e[0] === n);
      if (idx === -1) {
        this.#entries.push([n, v]);
      } else {
        this.#entries[idx][1] = v;
        this.#entries = this.#entries.filter((e, i) => e[0] !== n || i === idx);
      }
      this.#update();
    }
    sort() {
      this.#entries.sort((a, b) => a[0].localeCompare(b[0]));
      this.#update();
    }
    toString() {
      if (this.#entries.length === 0)
        return "";
      return beam.callSync("__url_compose_query", this.#entries);
    }
    forEach(callback, thisArg) {
      for (const [name, value] of this.#entries) {
        callback.call(thisArg, value, name, this);
      }
    }
    *entries() {
      for (const e of this.#entries)
        yield [...e];
    }
    *keys() {
      for (const e of this.#entries)
        yield e[0];
    }
    *values() {
      for (const e of this.#entries)
        yield e[1];
    }
    [Symbol.iterator]() {
      return this.entries();
    }
    get size() {
      return this.#entries.length;
    }
    #update() {
      if (this._url)
        this._url._updateSearch(this.toString());
    }
  }

  class QBURL {
    #components;
    #searchParams;
    constructor(url, base) {
      const args = base !== undefined ? [String(url), String(base)] : [String(url)];
      const result = beam.callSync("__url_parse", ...args);
      if (!result.ok)
        throw new TypeError(`Invalid URL: '${url}'`);
      this.#components = result.components;
      this.#searchParams = new QBURLSearchParams(this.#components.search);
      this.#searchParams._url = this;
    }
    get href() {
      return this.#components.href;
    }
    set href(v) {
      const result = beam.callSync("__url_parse", String(v));
      if (!result.ok)
        throw new TypeError(`Invalid URL: '${v}'`);
      this.#components = result.components;
      this.#searchParams = new QBURLSearchParams(this.#components.search);
      this.#searchParams._url = this;
    }
    get origin() {
      return this.#components.origin;
    }
    get protocol() {
      return this.#components.protocol;
    }
    set protocol(v) {
      this.#components.protocol = String(v).endsWith(":") ? String(v) : String(v) + ":";
      this.#recompose();
    }
    get username() {
      return this.#components.username;
    }
    set username(v) {
      this.#components.username = String(v);
      this.#recompose();
    }
    get password() {
      return this.#components.password;
    }
    set password(v) {
      this.#components.password = String(v);
      this.#recompose();
    }
    get host() {
      const port = this.#components.port;
      return port ? this.#components.hostname + ":" + port : this.#components.hostname;
    }
    set host(v) {
      const s = String(v);
      const ci = s.lastIndexOf(":");
      if (ci > 0 && !s.includes("]", ci)) {
        this.#components.hostname = s.slice(0, ci);
        this.#components.port = s.slice(ci + 1);
      } else {
        this.#components.hostname = s;
        this.#components.port = "";
      }
      this.#recompose();
    }
    get hostname() {
      return this.#components.hostname;
    }
    set hostname(v) {
      this.#components.hostname = String(v);
      this.#recompose();
    }
    get port() {
      return this.#components.port;
    }
    set port(v) {
      this.#components.port = v === "" || v === undefined ? "" : String(parseInt(v, 10));
      this.#recompose();
    }
    get pathname() {
      return this.#components.pathname;
    }
    set pathname(v) {
      this.#components.pathname = String(v);
      this.#recompose();
    }
    get search() {
      return this.#components.search;
    }
    set search(v) {
      const s = String(v);
      if (s === "")
        this.#components.search = "";
      else
        this.#components.search = s.startsWith("?") ? s : `?${s}`;
      this.#searchParams = new QBURLSearchParams(this.#components.search);
      this.#searchParams._url = this;
      this.#recompose();
    }
    get hash() {
      return this.#components.hash;
    }
    set hash(v) {
      const s = String(v);
      if (s === "")
        this.#components.hash = "";
      else
        this.#components.hash = s.startsWith("#") ? s : `#${s}`;
      this.#recompose();
    }
    get searchParams() {
      return this.#searchParams;
    }
    toString() {
      return this.href;
    }
    toJSON() {
      return this.href;
    }
    _updateSearch(qs) {
      this.#components.search = qs ? "?" + qs : "";
      this.#recompose();
    }
    #recompose() {
      const href = beam.callSync("__url_recompose", this.#components);
      this.#components.href = href;
      this.#components.origin = this.#buildOrigin();
    }
    #buildOrigin() {
      const p = this.#components.protocol;
      if (ORIGIN_SCHEMES.includes(p)) {
        let o = p + "//" + this.#components.hostname;
        if (this.#components.port)
          o += ":" + this.#components.port;
        return o;
      }
      return "null";
    }
    static canParse(url, base) {
      try {
        new QBURL(url, base);
        return true;
      } catch {
        return false;
      }
    }
  }
  globalThis.URL = QBURL;
  globalThis.URLSearchParams = QBURLSearchParams;
})();
