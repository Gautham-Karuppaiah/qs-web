import { useRef, useSyncExternalStore } from "react";
import {
  popRedo,
  popUndo,
  stackFor,
  subscribe,
  type Cmd,
} from "../lib/history";

export function useHistory(
  pageId: string,
  apply: (cmd: Cmd, present: boolean) => Promise<void>,
) {
  const stack = useSyncExternalStore(subscribe, () => stackFor(pageId));

  const applyRef = useRef(apply);
  applyRef.current = apply;

  return {
    canUndo: stack.undo.length > 0,
    canRedo: stack.redo.length > 0,
    undo: async () => {
      const cmd = popUndo(pageId);
      if (cmd) await applyRef.current(cmd, !cmd.present);
    },
    redo: async () => {
      const cmd = popRedo(pageId);
      if (cmd) await applyRef.current(cmd, cmd.present);
    },
  };
}
