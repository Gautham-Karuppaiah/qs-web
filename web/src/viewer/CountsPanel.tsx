import type { LegendEntry } from "../lib/legend";
import { countRows, type Counts, type Named } from "../lib/regions";

type Props = {
  entries: LegendEntry[] | null;
  boxes: Named[];
  zonesOfBox: Map<string, Named[]>;
  counts: Counts;
  untracked: number;
};

export function CountsPanel({
  entries,
  boxes,
  zonesOfBox,
  counts,
  untracked,
}: Props) {
  const list = entries ?? [];
  const rows = countRows(
    boxes,
    zonesOfBox,
    counts,
    list.map((e) => e.id),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      {!list.length || !boxes.length ? (
        <div className="p-2 text-xs text-muted-foreground">
          {!list.length
            ? "add a legend entry (E) to count"
            : "draw a section (A) on this page to count"}
        </div>
      ) : (
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b">
              <th className="px-2 py-1 text-left font-medium" />
              {list.map((e) => (
                <th
                  key={e.id}
                  title={e.label}
                  className="max-w-32 truncate px-3 py-1 text-right font-medium"
                >
                  {e.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={`${row.label}-${i}`}
                className={row.child ? "text-muted-foreground" : "font-medium"}
              >
                <td
                  className={`max-w-56 truncate px-2 py-1 ${row.child ? "pl-6" : ""}`}
                  title={row.label}
                >
                  {row.label}
                </td>
                {row.values.map((n, c) => (
                  <td
                    key={list[c].id}
                    className="px-3 py-1 text-right font-mono tabular-nums"
                  >
                    {n}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {untracked > 0 && (
        <div className="border-t px-2 py-1 text-xs text-amber-600 dark:text-amber-400">
          ⚠ {untracked} marker{untracked === 1 ? "" : "s"} outside every section
          on this page
        </div>
      )}
    </div>
  );
}
