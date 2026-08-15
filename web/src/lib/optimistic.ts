import type { QueryClient, QueryKey } from "@tanstack/react-query";

export type Ctx<Row> = {
  key: QueryKey;
  prev: Row[] | undefined;
  rollback?: () => void;
};

export function optimistic<Row, Vars>(opts: {
  client: QueryClient;
  key: () => QueryKey;
  apply: (rows: Row[], vars: Vars) => Row[];
  side?: (vars: Vars) => (() => void) | void;
  extra?: () => QueryKey[];
  settle?: boolean;
}) {
  const { client, key, apply, side, extra, settle = true } = opts;
  return {
    onMutate: async (vars: Vars): Promise<Ctx<Row>> => {
      const k = key();
      await client.cancelQueries({ queryKey: k });
      const prev = client.getQueryData<Row[]>(k);
      client.setQueryData<Row[]>(k, (old) => apply(old ?? [], vars));
      return { key: k, prev, rollback: side?.(vars) ?? undefined };
    },
    onError: (_e: unknown, _v: Vars, ctx: Ctx<Row> | undefined) => {
      if (!ctx) return;
      client.setQueryData(ctx.key, ctx.prev);
      ctx.rollback?.();
    },
    onSettled: (
      _d: unknown,
      _e: unknown,
      _v: Vars,
      ctx: Ctx<Row> | undefined,
    ) => {
      if (ctx && (settle || _e)) client.invalidateQueries({ queryKey: ctx.key });
      for (const k of extra?.() ?? []) client.invalidateQueries({ queryKey: k });
    },
  };
}

export const patchRow = <T extends { id: string }>(
  rows: T[],
  id: string,
  fields: Partial<T>,
) => rows.map((r) => (r.id === id ? { ...r, ...fields } : r));

export const dropRows = <T extends { id: string }>(
  rows: T[],
  ids: string | Set<string>,
) =>
  rows.filter((r) => (typeof ids === "string" ? r.id !== ids : !ids.has(r.id)));
