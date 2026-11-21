// Drop-in stand-in for the supabase-js client that talks to the Cloudflare
// Worker (cloudflare/worker) instead of Supabase. It implements exactly the
// parts of the supabase-js API this app uses, so pages don't change:
//   supabase.from(t).select/insert/update/upsert/delete + eq/neq/gt/gte/lt/lte/
//     in/is/ilike/like/match/not + order/limit/range/single/maybeSingle
//   supabase.storage.from(bucket).upload/getPublicUrl/remove
//   supabase.channel(name).on(...).subscribe()  (polls every 60s — D1 has no realtime)
// Used when the site is built with VITE_BACKEND=cloudflare.

const TOKEN_KEY = "ic_cf_token";
// D1 has no realtime, so subscribed channels re-run their callbacks on a
// timer. Every tick is a Worker request per open tab, which counts against
// Cloudflare's daily request allowance — so poll once a minute, only while
// the tab is visible, plus right away when the tab comes back into view.
const POLL_MS = 60000;

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
function setToken(t) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode — session just won't survive a reload */
  }
}

function authHeaders() {
  const t = getToken();
  return t ? { authorization: `Bearer ${t}` } : {};
}

async function call(path, init = {}) {
  let res;
  try {
    res = await fetch(path, { ...init, headers: { ...(init.headers || {}), ...authHeaders() } });
  } catch (err) {
    return { data: null, error: { message: "Network error — check your connection", code: "NETWORK" } };
  }
  let body;
  try {
    body = await res.json();
  } catch {
    body = { data: null, error: { message: `Server error (${res.status})`, code: String(res.status) } };
  }
  if (res.status === 401 && getToken() && body?.error?.code === "AUTH") {
    // Session expired or account disabled — let the app send the user to login.
    window.dispatchEvent(new CustomEvent("ic-auth-expired"));
  }
  return { data: body?.data ?? null, error: body?.error ?? null, status: res.status };
}

class QueryBuilder {
  constructor(table) {
    this.q = { table, op: "select", filters: [], order: [] };
  }
  // select() after insert/update/upsert/delete just means "return the rows",
  // which the Worker always does — so it only sets columns for a plain select.
  select(columns = "*") {
    if (this.q.op === "select") this.q.columns = columns;
    return this;
  }
  insert(payload) {
    this.q.op = "insert";
    this.q.payload = payload;
    return this;
  }
  update(payload) {
    this.q.op = "update";
    this.q.payload = payload;
    return this;
  }
  upsert(payload, { onConflict, ignoreDuplicates } = {}) {
    this.q.op = "upsert";
    this.q.payload = payload;
    if (onConflict) this.q.onConflict = onConflict;
    if (ignoreDuplicates) this.q.ignoreDuplicates = true;
    return this;
  }
  delete() {
    this.q.op = "delete";
    return this;
  }
  _f(op, col, val) {
    this.q.filters.push([op, col, val]);
    return this;
  }
  eq(c, v) {
    return this._f("eq", c, v);
  }
  neq(c, v) {
    return this._f("neq", c, v);
  }
  gt(c, v) {
    return this._f("gt", c, v);
  }
  gte(c, v) {
    return this._f("gte", c, v);
  }
  lt(c, v) {
    return this._f("lt", c, v);
  }
  lte(c, v) {
    return this._f("lte", c, v);
  }
  in(c, v) {
    return this._f("in", c, v);
  }
  is(c, v) {
    return this._f("is", c, v);
  }
  ilike(c, v) {
    return this._f("ilike", c, v);
  }
  like(c, v) {
    return this._f("like", c, v);
  }
  match(obj) {
    for (const [k, v] of Object.entries(obj)) this._f("eq", k, v);
    return this;
  }
  not(c, op, v) {
    if (op !== "is") throw new Error(`not(${op}) is not supported by the Cloudflare client`);
    return this._f("not_is", c, v);
  }
  order(col, { ascending = true, nullsFirst } = {}) {
    this.q.order.push([col, ascending, nullsFirst]);
    return this;
  }
  limit(n) {
    this.q.limit = n;
    return this;
  }
  range(from, to) {
    this.q.range = [from, to];
    return this;
  }
  single() {
    this.q.single = true;
    return this;
  }
  maybeSingle() {
    this.q.maybeSingle = true;
    return this;
  }
  async _run() {
    return call("/api/db", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(this.q),
    });
  }
  then(resolve, reject) {
    return this._run().then(resolve, reject);
  }
}

function storageBucket(bucket) {
  const enc = (p) => p.split("/").map(encodeURIComponent).join("/");
  return {
    async upload(path, file, { upsert = false, contentType } = {}) {
      const type = contentType || file?.type || "application/octet-stream";
      return call(`/api/storage/${encodeURIComponent(bucket)}/${enc(path)}${upsert ? "?upsert=true" : ""}`, {
        method: "PUT",
        headers: { "content-type": type },
        body: file,
      });
    },
    getPublicUrl(path, opts = {}) {
      let url = `${window.location.origin}/files/${encodeURIComponent(bucket)}/${enc(path)}`;
      if (opts.download) url += `?download=${encodeURIComponent(opts.download === true ? "" : opts.download)}`;
      return { data: { publicUrl: url } };
    },
    async remove(paths) {
      return call("/api/storage-remove", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bucket, paths }),
      });
    },
  };
}

// Realtime replacement: each .on() callback is re-run every POLL_MS while
// the channel is subscribed and the tab is visible.
class PollingChannel {
  constructor(name) {
    this.name = name;
    this.callbacks = [];
    this.timer = null;
  }
  on(_event, _filter, cb) {
    if (typeof cb === "function") this.callbacks.push(cb);
    return this;
  }
  subscribe(statusCb) {
    const fire = () => {
      for (const cb of this.callbacks) cb({ eventType: "*", new: {}, old: {} });
    };
    this.timer = setInterval(() => {
      if (document.visibilityState === "visible") fire();
    }, POLL_MS);
    this.onVisible = () => {
      if (document.visibilityState === "visible") fire();
    };
    document.addEventListener("visibilitychange", this.onVisible);
    statusCb?.("SUBSCRIBED");
    return this;
  }
  unsubscribe() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.onVisible) document.removeEventListener("visibilitychange", this.onVisible);
    return Promise.resolve("ok");
  }
}

export function createCloudflareClient() {
  return {
    isMock: false,
    isCloudflare: true,
    from: (table) => new QueryBuilder(table),
    storage: { from: storageBucket },
    channel: (name) => new PollingChannel(name),
    removeChannel: (ch) => ch?.unsubscribe?.(),
    cf: {
      async login(username, password) {
        const res = await call("/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        if (res.data?.token) setToken(res.data.token);
        return res;
      },
      logout() {
        setToken(null);
      },
      hasToken: () => !!getToken(),
    },
  };
}
