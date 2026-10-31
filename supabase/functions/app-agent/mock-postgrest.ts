// Enough of the PostgREST surface for the pipeline tests: equality / IN / IS
// filters, the upsert-with-on-conflict the stage journal and the packing draft
// use, and the terminal read shapes. Shared by the packing and pipeline tests so
// a resumed run is exercised against the same write semantics as a single stage.
export type Row = Record<string, any>;

export function mockDb(tables: Record<string, Row[]>, rpc: (name: string, params: Record<string, any>) => Promise<{ data: any; error: any }>) {
  let sequence = 0;
  const rows = (table: string) => (tables[table] ??= []);
  const client = {
    from: (table: string) => {
      const filters: Array<{ kind: string; column: string; value: any }> = [];
      let pending: { mode: string; values: Row; onConflict: string[] } | null = null;
      let single = false;
      const matched = () => rows(table).filter(row => filters.every(filter =>
        filter.kind === 'in' ? (filter.value as any[]).includes(row[filter.column])
          : filter.kind === 'is' ? (row[filter.column] ?? null) === filter.value
            : filter.kind === 'neq' ? row[filter.column] !== filter.value
              : row[filter.column] === filter.value));
      const write = () => {
        if (!pending) return matched();
        const { mode, values, onConflict } = pending;
        pending = null;
        if (mode === 'update') {
          const target = matched();
          for (const row of target) Object.assign(row, values);
          return target;
        }
        if (mode === 'insert') {
          const created = { id: `${table}-${++sequence}`, ...values };
          rows(table).push(created);
          return [created];
        }
        const existing = onConflict.length
          ? rows(table).find(row => onConflict.every(column => row[column] === values[column]))
          : matched().find(row => Object.keys(values).every(column => row[column] === values[column]));
        if (existing) {
          Object.assign(existing, values);
          return [existing];
        }
        const created = { id: `${table}-${++sequence}`, ...values };
        rows(table).push(created);
        return [created];
      };
      const read = () => (single ? { data: write()[0] ?? null, error: null } : { data: write(), error: null });
      const chain: any = {
        select: () => chain,
        eq: (column: string, value: any) => { filters.push({ kind: 'eq', column, value }); return chain; },
        in: (column: string, value: any[]) => { filters.push({ kind: 'in', column, value }); return chain; },
        is: (column: string, value: any) => { filters.push({ kind: 'is', column, value }); return chain; },
        neq: (column: string, value: any) => { filters.push({ kind: 'neq', column, value }); return chain; },
        ilike: (column: string, value: any) => { filters.push({ kind: 'eq', column, value }); return chain; },
        order: () => chain, limit: () => chain,
        insert: (values: Row) => { pending = { mode: 'insert', values, onConflict: [] }; return chain; },
        update: (values: Row) => { pending = { mode: 'update', values, onConflict: [] }; return chain; },
        upsert: (values: Row, options?: { onConflict?: string }) => {
          pending = { mode: 'upsert', values, onConflict: (options?.onConflict || '').split(',').filter(Boolean) };
          return chain;
        },
        single: () => { single = true; return Promise.resolve(read()); },
        maybeSingle: () => { single = true; return Promise.resolve(read()); },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(read()).then(resolve),
      };
      return chain;
    },
    rpc: (name: string, params: Record<string, any>) => rpc(name, params),
  };
  return { client, tables };
}
