// Supabase (PostgREST) caps a single select response at 1000 rows by
// default. Tables that can grow past that (like stock_items, with every
// department's full catalog) need paged fetches or rows silently go
// missing from the client — including rows the user just inserted.
export async function fetchAllRows(buildQuery, pageSize = 1000) {
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) return { data: all, error };
    const rows = data ?? [];
    all = all.concat(rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return { data: all, error: null };
}
