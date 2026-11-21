// Translates the small query description sent by the browser client
// (src/lib/cfClient.js) into parameterised SQLite for D1.
//
// Every table and column name is checked against schema.js before it is
// put into SQL, and every value is bound as a parameter, so a request can
// never inject SQL.
import { TABLES } from "./schema.js";

export class ApiError extends Error {
  constructor(message, code = "ERROR") {
    super(message);
    this.code = code;
  }
}

const MAX_ROWS_PER_REQUEST = 5000;

function tableDef(table) {
  const t = TABLES[table];
  if (!t) throw new ApiError(`Unknown table: ${table}`, "42P01");
  return t;
}

function col(t, table, name) {
  if (typeof name !== "string" || !t.cols[name]) {
    throw new ApiError(`Column "${name}" does not exist on "${table}"`, "42703");
  }
  return `"${name}"`;
}

// JS value -> what is stored in SQLite, by column type.
export function encodeValue(type, v) {
  if (v === undefined || v === null) return null;
  switch (type) {
    case "b":
      return v === true || v === 1 || v === "true" || v === "1" || v === "t" ? 1 : 0;
    case "j":
      return JSON.stringify(v);
    case "i":
    case "n": {
      if (v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    default:
      return typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v);
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function defaultValue(c) {
  const d = c.def;
  if (d === undefined) return undefined;
  if (d === "@uuid") return crypto.randomUUID();
  if (d === "@now") return new Date().toISOString();
  if (d === "@today") return today();
  if (c.t === "j") return JSON.parse(d);
  if (c.t === "b") return d === "true";
  if (c.t === "i" || c.t === "n") return Number(d);
  return d;
}

function buildWhere(t, table, filters = []) {
  const parts = [];
  const params = [];
  for (const f of filters) {
    const [op, name, value] = f;
    const c = col(t, table, name);
    const type = t.cols[name].t;
    switch (op) {
      case "eq":
        if (value === null) parts.push(`${c} IS NULL`);
        else {
          parts.push(`${c} = ?`);
          params.push(encodeValue(type, value));
        }
        break;
      case "neq":
        parts.push(`${c} <> ?`);
        params.push(encodeValue(type, value));
        break;
      case "gt":
      case "gte":
      case "lt":
      case "lte": {
        const sym = { gt: ">", gte: ">=", lt: "<", lte: "<=" }[op];
        parts.push(`${c} ${sym} ?`);
        params.push(encodeValue(type, value));
        break;
      }
      case "in": {
        if (!Array.isArray(value)) throw new ApiError("in() needs an array", "PGRST100");
        if (value.length === 0) {
          parts.push("0");
          break;
        }
        // One bound parameter regardless of list size (D1 caps parameters at 100).
        parts.push(`${c} IN (SELECT value FROM json_each(?))`);
        params.push(JSON.stringify(value.map((v) => encodeValue(type, v))));
        break;
      }
      case "is":
        if (value === null || value === "null") parts.push(`${c} IS NULL`);
        else if (value === true || value === "true") parts.push(`${c} = 1`);
        else if (value === false || value === "false") parts.push(`${c} = 0`);
        else throw new ApiError("is() only accepts null/true/false", "PGRST100");
        break;
      case "not_is":
        if (value === null || value === "null") parts.push(`${c} IS NOT NULL`);
        else throw new ApiError("not.is only supports null", "PGRST100");
        break;
      case "ilike":
        parts.push(`lower(${c}) LIKE lower(?) ESCAPE '\\'`);
        params.push(String(value).replace(/\*/g, "%"));
        break;
      case "like":
        // SQLite LIKE ignores ASCII case; GLOB keeps it, so use GLOB for like().
        parts.push(`${c} GLOB ?`);
        params.push(String(value).replace(/%/g, "*").replace(/_/g, "?"));
        break;
      default:
        throw new ApiError(`Unsupported filter: ${op}`, "PGRST100");
    }
  }
  return { sql: parts.length ? ` WHERE ${parts.join(" AND ")}` : "", params };
}

function buildOrder(t, table, order = []) {
  if (!order.length) return "";
  const parts = order.map(([name, ascending = true, nullsFirst]) => {
    const c = col(t, table, name);
    // Postgres default: ASC puts NULLs last, DESC puts them first.
    const nf = nullsFirst ?? !ascending;
    return `(${c} IS NULL) ${nf ? "DESC" : "ASC"}, ${c} ${ascending ? "ASC" : "DESC"}`;
  });
  return ` ORDER BY ${parts.join(", ")}`;
}

function buildSelectCols(t, table, columns) {
  if (!columns || columns.trim() === "*") return "*";
  const names = columns.split(",").map((s) => s.trim()).filter(Boolean);
  return names.map((n) => col(t, table, n)).join(", ");
}

function rowsOf(payload) {
  const rows = Array.isArray(payload) ? payload : [payload];
  if (!rows.length) return [];
  for (const r of rows) if (!r || typeof r !== "object") throw new ApiError("Payload must be an object", "PGRST102");
  return rows;
}

function insertStatement(db, t, table, row, { conflict, ignore } = {}) {
  const given = new Set(Object.keys(row));
  const full = {};
  for (const [name, c] of Object.entries(t.cols)) {
    if (given.has(name)) full[name] = row[name];
    else {
      const d = defaultValue(c);
      if (d !== undefined) full[name] = d;
    }
  }
  for (const k of given) col(t, table, k); // reject unknown columns
  const names = Object.keys(full);
  const sqlCols = names.map((n) => `"${n}"`).join(", ");
  const marks = names.map(() => "?").join(", ");
  const params = names.map((n) => encodeValue(t.cols[n].t, full[n]));
  let sql = `INSERT INTO "${table}" (${sqlCols}) VALUES (${marks})`;
  if (conflict) {
    const target = conflict.map((n) => col(t, table, n)).join(", ");
    const updatable = [...given].filter((n) => !conflict.includes(n) && n !== "id");
    if (ignore || !updatable.length) sql += ` ON CONFLICT (${target}) DO NOTHING`;
    else sql += ` ON CONFLICT (${target}) DO UPDATE SET ${updatable.map((n) => `"${n}" = excluded."${n}"`).join(", ")}`;
  }
  sql += " RETURNING *";
  return db.prepare(sql).bind(...params);
}

export async function runQuery(db, q) {
  const { table } = q;
  const t = tableDef(table);
  const op = q.op || "select";

  if (op === "select") {
    const where = buildWhere(t, table, q.filters);
    let sql = `SELECT ${buildSelectCols(t, table, q.columns)} FROM "${table}"${where.sql}${buildOrder(t, table, q.order)}`;
    const params = [...where.params];
    let limit = null;
    let offset = 0;
    if (Array.isArray(q.range)) {
      offset = Math.max(0, Number(q.range[0]) || 0);
      limit = Math.max(0, Number(q.range[1]) - offset + 1);
    }
    if (q.limit != null) limit = limit == null ? Number(q.limit) : Math.min(limit, Number(q.limit));
    if (limit != null || offset) {
      sql += " LIMIT ? OFFSET ?";
      params.push(limit ?? -1, offset);
    }
    const { results } = await db.prepare(sql).bind(...params).all();
    return results;
  }

  if (op === "insert" || op === "upsert") {
    const rows = rowsOf(q.payload);
    if (rows.length > MAX_ROWS_PER_REQUEST) throw new ApiError("Too many rows in one request", "PGRST102");
    let conflict = null;
    if (op === "upsert") {
      conflict = (q.onConflict || "id").split(",").map((s) => s.trim()).filter(Boolean);
    }
    const stmts = rows.map((r) => {
      // Upsert on the primary key with no id given is just an insert.
      if (conflict && conflict.length === 1 && conflict[0] === "id" && r.id == null) {
        return insertStatement(db, t, table, r);
      }
      return insertStatement(db, t, table, r, { conflict, ignore: q.ignoreDuplicates });
    });
    const out = [];
    // D1 batches run as one transaction; chunk very large ones.
    for (let i = 0; i < stmts.length; i += 100) {
      const res = await db.batch(stmts.slice(i, i + 100));
      for (const r of res) out.push(...(r.results || []));
    }
    return out;
  }

  if (op === "update" || op === "delete") {
    if (!q.filters || !q.filters.length) throw new ApiError(`${op.toUpperCase()} requires a WHERE clause`, "21000");
    const where = buildWhere(t, table, q.filters);
    if (op === "delete") {
      const { results } = await db.prepare(`DELETE FROM "${table}"${where.sql} RETURNING *`).bind(...where.params).all();
      return results;
    }
    const payload = q.payload || {};
    const names = Object.keys(payload);
    if (!names.length) return [];
    const set = names.map((n) => `${col(t, table, n)} = ?`).join(", ");
    const params = names.map((n) => encodeValue(t.cols[n].t, payload[n]));
    const { results } = await db
      .prepare(`UPDATE "${table}" SET ${set}${where.sql} RETURNING *`)
      .bind(...params, ...where.params)
      .all();
    return results;
  }

  throw new ApiError(`Unsupported operation: ${op}`, "PGRST100");
}
