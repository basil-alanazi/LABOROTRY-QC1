// In-memory stand-in for the Supabase client, used only when no real
// Supabase project is configured (VITE_SUPABASE_URL/ANON_KEY missing).
// Mimics the subset of the supabase-js query builder this app actually
// uses (select/insert/update + eq/gte/lte/order/limit/single), so pages
// don't need to know whether they're talking to a real backend or not.
// Nothing here persists across a page reload.

function uid() {
  return crypto.randomUUID();
}

class QueryBuilder {
  constructor(table, store) {
    this.table = table;
    this.store = store;
    this._filters = [];
    this._order = [];
    this._limit = null;
    this._single = false;
    this._op = "select";
    this._payload = null;
  }

  select() {
    return this;
  }
  eq(col, val) {
    this._filters.push((r) => r[col] === val);
    return this;
  }
  in(col, vals) {
    this._filters.push((r) => vals.includes(r[col]));
    return this;
  }
  gte(col, val) {
    this._filters.push((r) => r[col] >= val);
    return this;
  }
  lte(col, val) {
    this._filters.push((r) => r[col] <= val);
    return this;
  }
  order(col, { ascending = true } = {}) {
    this._order.push({ col, ascending });
    return this;
  }
  limit(n) {
    this._limit = n;
    return this;
  }
  single() {
    this._single = true;
    return this;
  }
  insert(payload) {
    this._op = "insert";
    this._payload = payload;
    return this;
  }
  update(payload) {
    this._op = "update";
    this._payload = payload;
    return this;
  }

  async _exec() {
    const rows = this.store.get(this.table) || [];

    if (this._op === "insert") {
      const items = Array.isArray(this._payload) ? this._payload : [this._payload];
      const inserted = items.map((it) => ({ id: uid(), created_at: new Date().toISOString(), ...it }));
      this.store.set(this.table, [...rows, ...inserted]);
      return { data: inserted, error: null };
    }

    let filtered = rows.filter((r) => this._filters.every((f) => f(r)));

    if (this._op === "update") {
      filtered.forEach((r) => Object.assign(r, this._payload));
      return { data: filtered, error: null };
    }

    this._order.forEach(({ col, ascending }) => {
      filtered = [...filtered].sort((a, b) => {
        if (a[col] === b[col]) return 0;
        const gt = a[col] > b[col] ? 1 : -1;
        return ascending ? gt : -gt;
      });
    });
    if (this._limit) filtered = filtered.slice(0, this._limit);

    if (this._single) {
      return filtered[0] ? { data: filtered[0], error: null } : { data: null, error: { message: "not found" } };
    }
    return { data: filtered, error: null };
  }

  then(resolve, reject) {
    return this._exec().then(resolve, reject);
  }
}

export function createMockClient(seed) {
  const store = new Map(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  return {
    isMock: true,
    from(table) {
      return new QueryBuilder(table, store);
    },
    storage: {
      from() {
        return {
          async upload(path) {
            return { data: { path }, error: null };
          },
          getPublicUrl(path) {
            return { data: { publicUrl: `#mock-file/${path}` } };
          },
        };
      },
    },
  };
}
