import { useState } from "react";
import type { Page } from "../lib/pages";
import { IconButton, Rename, RowButtons } from "./Dock";

export type PageBox = { id: string; label: string };

type Props = {
  pages: Page[] | null;
  currentPageId: string;
  boxesOfPage: Map<string, PageBox[]>;
  untrackedOfPage: Map<string, number>;
  busy: boolean;
  onOpen: (page: Page) => void;
  onRename: (page: Page, name: string) => void;
  onTrash: (page: Page) => void;
  onFinish: (page: Page, finished: boolean) => void;
  onEditBox: (id: string) => void;
  onTrashBox: (id: string) => void;
};

export function DrawingsPanel({
  pages,
  currentPageId,
  boxesOfPage,
  untrackedOfPage,
  busy,
  onOpen,
  onRename,
  onTrash,
  onFinish,
  onEditBox,
  onTrashBox,
}: Props) {
  const [renaming, setRenaming] = useState<string | null>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
      {pages && !pages.length && (
        <span className="px-1 text-xs text-muted-foreground">
          every page in this project is in the trash
        </span>
      )}
      <ul>
        {pages?.map((p) => {
          const untracked = untrackedOfPage.get(p.id) ?? 0;
          const boxes = boxesOfPage.get(p.id) ?? [];
          return (
            <li key={p.id}>
              {renaming === p.id ? (
                <div className="px-1 py-0.5">
                  <Rename
                    value={p.name}
                    onDone={(name) => {
                      if (name) onRename(p, name);
                      setRenaming(null);
                    }}
                  />
                </div>
              ) : (
                <div className="group flex items-center gap-0.5">
                  <input
                    type="checkbox"
                    title={p.finished_at ? "finished" : "mark finished"}
                    checked={!!p.finished_at}
                    onChange={(e) => onFinish(p, e.target.checked)}
                    className="ml-1 shrink-0 accent-current"
                  />
                  <button
                    type="button"
                    onClick={() => onOpen(p)}
                    onDoubleClick={() => setRenaming(p.id)}
                    title={p.name}
                    className={`flex min-w-0 flex-1 items-center gap-1 border-l-2 px-2 py-1 text-left text-sm ${
                      p.id === currentPageId
                        ? "border-foreground bg-muted font-medium"
                        : "border-transparent hover:bg-muted/60"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    {untracked > 0 && (
                      <span
                        title={`${untracked} markers outside every area`}
                        className="shrink-0 text-amber-600 dark:text-amber-400"
                      >
                        ⚠
                      </span>
                    )}
                  </button>
                  <RowButtons>
                    <IconButton title="rename" onClick={() => setRenaming(p.id)}>
                      ✎
                    </IconButton>
                    <IconButton
                      title="delete page"
                      danger
                      disabled={busy}
                      onClick={() => onTrash(p)}
                    >
                      ✕
                    </IconButton>
                  </RowButtons>
                </div>
              )}

              <ul>
                {boxes.map((b) => (
                  <li
                    key={b.id}
                    className="group flex items-center gap-0.5 pl-6 pr-1"
                  >
                    <button
                      type="button"
                      onClick={() => onOpen(p)}
                      onDoubleClick={() => onEditBox(b.id)}
                      title={b.label}
                      className="min-w-0 flex-1 truncate px-1 py-0.5 text-left text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    >
                      ▸ {b.label}
                    </button>
                    <RowButtons>
                      <IconButton
                        title="assign to building / floor"
                        onClick={() => onEditBox(b.id)}
                      >
                        ✎
                      </IconButton>
                      <IconButton
                        title="delete section"
                        danger
                        disabled={busy}
                        onClick={() => onTrashBox(b.id)}
                      >
                        ✕
                      </IconButton>
                    </RowButtons>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
