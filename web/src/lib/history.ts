import type { PageMarker } from "./markers";
import type { Section } from "./sections";
import type { Zone } from "./zones";

export const HISTORY_LIMIT = 100;

export type Cmd =
  | { kind: "marker"; present: boolean; rows: PageMarker[]; entryId: string }
  | { kind: "zone"; present: boolean; rows: Zone[]; entryId?: undefined }
  | { kind: "section"; present: boolean; rows: Section[]; entryId?: undefined };

export type Stack = { undo: Cmd[]; redo: Cmd[] };

export const EMPTY: Stack = { undo: [], redo: [] };

let stacks = new Map<string, Stack>();
const listeners = new Set<() => void>();

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export const stackFor = (pageId: string | null) =>
  (pageId && stacks.get(pageId)) || EMPTY;

const commit = (next: Map<string, Stack>) => {
  stacks = next;
  for (const fn of listeners) fn();
};

const write = (pageId: string, stack: Stack) =>
  commit(new Map(stacks).set(pageId, stack));

export const cmdId = (cmd: Cmd) => cmd.rows[0].id;

export function push(pageId: string, cmd: Cmd) {
  const { undo } = stackFor(pageId);
  write(pageId, { undo: [...undo, cmd].slice(-HISTORY_LIMIT), redo: [] });
}

export function popUndo(pageId: string) {
  const { undo, redo } = stackFor(pageId);
  const cmd = undo[undo.length - 1];
  if (!cmd) return null;
  write(pageId, { undo: undo.slice(0, -1), redo: [...redo, cmd] });
  return cmd;
}

export function popRedo(pageId: string) {
  const { undo, redo } = stackFor(pageId);
  const cmd = redo[redo.length - 1];
  if (!cmd) return null;
  write(pageId, { undo: [...undo, cmd], redo: redo.slice(0, -1) });
  return cmd;
}

export function dropCmd(pageId: string, id: string) {
  const { undo, redo } = stackFor(pageId);
  write(pageId, {
    undo: undo.filter((c) => cmdId(c) !== id),
    redo: redo.filter((c) => cmdId(c) !== id),
  });
}

export function dropEntry(entryId: string) {
  const next = new Map<string, Stack>();
  for (const [pageId, stack] of stacks)
    next.set(pageId, {
      undo: stack.undo.filter((c) => c.entryId !== entryId),
      redo: stack.redo.filter((c) => c.entryId !== entryId),
    });
  commit(next);
}
