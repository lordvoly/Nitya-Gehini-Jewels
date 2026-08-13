import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const useMockDb = process.env.DEV_MOCK_DB !== "false" && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY);

class MockQueryBuilder {
  private filters: Array<{ column: string; operator: string; value: unknown }> = [];
  private payload: Record<string, unknown> | Record<string, unknown>[] | null = null;
  private action: "select" | "insert" | "update" | "delete" = "select";
  private isSingle = false;

  constructor(private readonly table: string, private readonly store: Map<string, Record<string, unknown>[]>) {}

  select() {
    this.action = "select";
    return this;
  }

  insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
    this.action = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.action = "update";
    this.payload = payload;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, operator: "eq", value });
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push({ column, operator: "neq", value });
    return this;
  }

  ilike(column: string, value: unknown) {
    this.filters.push({ column, operator: "ilike", value });
    return this;
  }

  in(column: string, value: unknown) {
    this.filters.push({ column, operator: "in", value });
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push({ column, operator: "gte", value });
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push({ column, operator: "lte", value });
    return this;
  }

  gt(column: string, value: unknown) {
    this.filters.push({ column, operator: "gt", value });
    return this;
  }

  lt(column: string, value: unknown) {
    this.filters.push({ column, operator: "lt", value });
    return this;
  }

  contains(column: string, value: unknown) {
    this.filters.push({ column, operator: "contains", value });
    return this;
  }

  order() {
    return this;
  }

  range() {
    return this;
  }

  limit() {
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isSingle = true;
    return this;
  }

  private readStore() {
    return this.store.get(this.table) ?? [];
  }

  private writeStore(rows: Record<string, unknown>[]) {
    this.store.set(this.table, rows);
  }

  private matches(row: Record<string, unknown>) {
    return this.filters.every(({ column, operator, value }) => {
      const raw = row[column];
      const text = raw == null ? "" : String(raw);

      switch (operator) {
        case "eq":
          return raw === value;
        case "neq":
          return raw !== value;
        case "ilike":
          return text.toLowerCase().includes(String(value).replace(/%/g, "").toLowerCase());
        case "in":
          return Array.isArray(value) ? value.includes(raw) : false;
        case "gte":
          return text >= String(value);
        case "lte":
          return text <= String(value);
        case "gt":
          return text > String(value);
        case "lt":
          return text < String(value);
        case "contains":
          return typeof raw === "object" && raw !== null && typeof value === "object" && value !== null
            ? Object.entries(value as Record<string, unknown>).every(([key, nestedValue]) => (raw as Record<string, unknown>)[key] === nestedValue)
            : false;
        default:
          return true;
      }
    });
  }

  private resolve() {
    if (this.action === "insert") {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
      const created = rows.map((row) => ({
        id: row.id ?? randomUUID(),
        ...row,
        created_at: row.created_at ?? new Date().toISOString(),
        updated_at: row.updated_at ?? new Date().toISOString(),
      }));
      this.writeStore([...this.readStore(), ...created]);
      return { data: this.isSingle ? created[0] ?? null : created, error: null, count: created.length };
    }

    if (this.action === "update") {
      const rows = this.readStore();
      const updatedRows: Record<string, unknown>[] = [];
      const nextRows = rows.map((row) => {
        if (!this.matches(row)) {
          return row;
        }

        const updated = { ...row, ...(this.payload ?? {}), updated_at: new Date().toISOString() };
        updatedRows.push(updated);
        return updated;
      });

      this.writeStore(nextRows);
      return { data: this.isSingle ? updatedRows[0] ?? null : updatedRows, error: null, count: updatedRows.length };
    }

    if (this.action === "delete") {
      const rows = this.readStore();
      const kept = rows.filter((row) => !this.matches(row));
      this.writeStore(kept);
      return { data: this.isSingle ? null : [], error: null, count: rows.length - kept.length };
    }

    const rows = this.readStore().filter((row) => this.matches(row));
    return { data: this.isSingle ? rows[0] ?? null : rows, error: null, count: rows.length };
  }

  then(onfulfilled?: (value: { data: unknown; error: null; count?: number }) => unknown, onrejected?: (reason: unknown) => unknown) {
    return Promise.resolve(this.resolve()).then(onfulfilled, onrejected);
  }
}

class MockSupabaseClient {
  private readonly store = new Map<string, Record<string, unknown>[]>();

  auth = {
    getUser: async () => ({
      data: {
        user: {
          id: "dev-user",
          email: "dev@example.com",
        },
      },
      error: null,
    }),
  };

  storage = {
    from: (_bucket: string) => ({
      upload: async () => ({ error: null }),
      getPublicUrl: (path: string) => ({ data: { publicUrl: `http://localhost/mock-storage/${path}` } }),
      remove: async () => ({ error: null }),
    }),
  };

  from(table: string) {
    return new MockQueryBuilder(table, this.store);
  }

  rpc() {
    return Promise.resolve({ data: null, error: null });
  }
}

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (useMockDb) {
  console.warn("Backend starting in local mock mode because SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are not set.");
}

// Service-role client: full DB access, bypasses RLS. This key must never
// reach the frontend — only this backend process holds it.
export const supabase: any = useMockDb
  ? new MockSupabaseClient()
  : createClient(url, serviceRoleKey, {
      auth: { persistSession: false },
    });
