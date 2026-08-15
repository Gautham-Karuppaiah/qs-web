import { useState } from "react";
import { hexToDataUrl, type LegendEntry } from "../lib/legend";

type Props = {
  entries: LegendEntry[] | null;
  counts: Map<string, number>;
  colorOf: Map<string, string>;
  activeId: string | null;
  busy: boolean;
  onSelect: (id: string) => void;
  onRename: (entry: LegendEntry, label: string) => void;
  onTrash: (entry: LegendEntry) => void;
};

export function LegendPanel({
  entries,
  counts,
  colorOf,
  activeId,
  busy,
  onSelect,
  onRename,
  onTrash,
}: Props) {
  const [renaming, setRenaming] = useState<string | null>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
      {entries && !entries.length && (
        <div className="text-xs text-muted-foreground">
          drag a box with the entry tool (E) to add one
        </div>
      )}
      <ul className="space-y-1">
        {entries?.map((entry) => (
          <li key={entry.id} className="group flex items-center gap-0.5">
            {renaming === entry.id ? (
              <input
                autoFocus
                defaultValue={entry.label}
                onBlur={(e) => {
                  const label = e.target.value.trim();
                  if (label && label !== entry.label) onRename(entry, label);
                  setRenaming(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") {
                    e.currentTarget.value = entry.label;
                    e.currentTarget.blur();
                  }
                }}
                className="w-full rounded border bg-background px-1.5 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onSelect(entry.id)}
                  onDoubleClick={() => setRenaming(entry.id)}
                  style={{ borderLeftColor: colorOf.get(entry.id) }}
                  className={`flex min-w-0 flex-1 items-center gap-2 border-l-4 p-1 text-left ${
                    entry.id === activeId
                      ? "bg-muted font-medium"
                      : "hover:bg-muted/60"
                  }`}
                >
                  {entry.image && (
                    <img
                      src={hexToDataUrl(entry.image)}
                      alt={entry.label}
                      className="h-10 w-10 shrink-0 border bg-white object-contain"
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {entry.label}
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {counts.get(entry.id) ?? 0}
                  </span>
                </button>
                <div className="flex shrink-0 flex-col opacity-0 group-hover:opacity-100">
                  <button
                    type="button"
                    title="rename"
                    onClick={() => setRenaming(entry.id)}
                    className="rounded px-1 text-xs text-muted-foreground hover:bg-accent"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    title="delete legend entry"
                    disabled={busy}
                    onClick={() => onTrash(entry)}
                    className="rounded px-1 text-xs text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-30"
                  >
                    ✕
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
