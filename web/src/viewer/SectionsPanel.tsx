import { useState } from "react";
import { isBox, type Section } from "../lib/sections";
import { IconButton, Rename, RowButtons } from "./Dock";

type Props = {
  sections: Section[] | null;
  currentPageId: string;
  pageNameOf: Map<string, string>;
  busy: boolean;
  onOpenPage: (pageId: string) => void;
  onAddGroup: (name: string, parentId: string | null) => void;
  onRename: (id: string, name: string) => void;
  onEditBox: (id: string) => void;
  onTrash: (s: Section) => void;
};

export function SectionsPanel({
  sections,
  currentPageId,
  pageNameOf,
  busy,
  onOpenPage,
  onAddGroup,
  onRename,
  onEditBox,
  onTrash,
}: Props) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null | false>(false);

  const all = sections ?? [];
  const childrenOf = (id: string | null) => all.filter((s) => s.parent_id === id);
  const unassigned = all.filter((s) => s.parent_id === null && isBox(s));

  const boxRow = (s: Section, depth: number) => {
    const name = s.page_id
      ? (pageNameOf.get(s.page_id) ?? "missing page")
      : "no page";
    return (
      <li key={s.id}>
        <div
          className="group flex items-center gap-0.5 pr-1"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          <button
            type="button"
            disabled={!s.page_id}
            onClick={() => s.page_id && onOpenPage(s.page_id)}
            title={name}
            className={`min-w-0 flex-1 truncate border-l-2 px-1 py-0.5 text-left text-sm hover:bg-muted/60 ${
              s.page_id === currentPageId
                ? "border-foreground font-medium"
                : "border-transparent text-muted-foreground"
            }`}
          >
            {name}
          </button>
          <RowButtons>
            <IconButton
              title="assign to building / floor"
              onClick={() => onEditBox(s.id)}
            >
              ✎
            </IconButton>
            <IconButton
              title="delete section"
              danger
              disabled={busy}
              onClick={() => onTrash(s)}
            >
              ✕
            </IconButton>
          </RowButtons>
        </div>
      </li>
    );
  };

  const groupRow = (s: Section, depth: number) => {
    if (isBox(s)) return boxRow(s, depth);
    return (
      <li key={s.id}>
        <div
          className="group flex items-center gap-0.5 pr-1"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          {renaming === s.id ? (
            <Rename
              value={s.name}
              onDone={(name) => {
                if (name) onRename(s.id, name);
                setRenaming(null);
              }}
            />
          ) : (
            <>
              <span
                onDoubleClick={() => setRenaming(s.id)}
                className="min-w-0 flex-1 truncate py-0.5 text-sm font-medium"
              >
                {s.name || "Section"}
              </span>
              <RowButtons>
                <IconButton
                  title="add a group inside"
                  onClick={() => setAdding(s.id)}
                >
                  +
                </IconButton>
                <IconButton title="rename" onClick={() => setRenaming(s.id)}>
                  ✎
                </IconButton>
                <IconButton
                  title="delete"
                  danger
                  disabled={busy}
                  onClick={() => onTrash(s)}
                >
                  ✕
                </IconButton>
              </RowButtons>
            </>
          )}
        </div>

        {adding === s.id && (
          <div style={{ paddingLeft: `${depth * 12 + 16}px` }}>
            <Rename
              value=""
              onDone={(name) => {
                if (name) onAddGroup(name, s.id);
                setAdding(false);
              }}
            />
          </div>
        )}

        <ul>{childrenOf(s.id).map((c) => groupRow(c, depth + 1))}</ul>
      </li>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-xs text-muted-foreground">
          buildings and floors
        </span>
        <IconButton title="add a building" onClick={() => setAdding(null)}>
          + group
        </IconButton>
      </div>

      {adding === null && (
        <Rename
          value=""
          onDone={(name) => {
            if (name) onAddGroup(name, null);
            setAdding(false);
          }}
        />
      )}

      {sections && !all.length && (
        <div className="px-1 text-xs text-muted-foreground">
          draw a section (A) on a page to start
        </div>
      )}

      <ul>
        {childrenOf(null)
          .filter((s) => !isBox(s))
          .map((s) => groupRow(s, 0))}
      </ul>

      {unassigned.length > 0 && (
        <ul className="mt-2">
          <li>
            <div className="px-1 py-0.5 text-sm font-medium text-muted-foreground">
              Unassigned
            </div>
            <ul>{unassigned.map((s) => boxRow(s, 1))}</ul>
          </li>
        </ul>
      )}
    </div>
  );
}
