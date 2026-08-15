import { Button } from "@/components/ui/button";
import type { Preflight } from "../lib/export";
import type { Page } from "../lib/pages";

type Props = {
  preflight: Preflight;
  busy: boolean;
  onOpenPage: (page: Page) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

function Group({
  title,
  pages,
  onOpenPage,
}: {
  title: string;
  pages: Array<{ page: Page; note?: string }>;
  onOpenPage: (page: Page) => void;
}) {
  if (!pages.length) return null;
  return (
    <div className="mb-3">
      <div className="mb-1 text-sm">{title}</div>
      <ul className="border">
        {pages.map(({ page, note }) => (
          <li key={page.id}>
            <button
              type="button"
              onClick={() => onOpenPage(page)}
              className="flex w-full items-center gap-2 px-2 py-1 text-left text-sm hover:bg-muted"
            >
              <span className="min-w-0 flex-1 truncate">{page.name}</span>
              {note && (
                <span className="shrink-0 text-muted-foreground">{note}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ExportDialog({
  preflight,
  busy,
  onOpenPage,
  onCancel,
  onConfirm,
}: Props) {
  const untracked = preflight.untracked.reduce((a, u) => a + u.count, 0);

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
      <div
        data-ui
        className="flex max-h-[80vh] w-[34rem] flex-col border bg-background"
      >
        <div className="border-b px-3 py-2 text-sm font-medium">
          Review before export
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <p className="mb-3 text-xs text-muted-foreground">
            Click a page to go and fix it. That cancels the export.
          </p>

          <Group
            title={`${untracked} marker${untracked === 1 ? "" : "s"} outside every section — excluded from the export`}
            pages={preflight.untracked.map((u) => ({
              page: u.page,
              note: String(u.count),
            }))}
            onOpenPage={onOpenPage}
          />
          <Group
            title={`${preflight.unfinished.length} page${
              preflight.unfinished.length === 1 ? " has" : "s have"
            } counts but ${preflight.unfinished.length === 1 ? "isn't" : "aren't"} marked finished`}
            pages={preflight.unfinished.map((page) => ({ page }))}
            onOpenPage={onOpenPage}
          />
          <Group
            title={`${preflight.empty.length} page${
              preflight.empty.length === 1 ? " has" : "s have"
            } no counts`}
            pages={preflight.empty.map((page) => ({ page }))}
            onOpenPage={onOpenPage}
          />
        </div>

        <div className="flex justify-end gap-2 border-t px-3 py-2">
          <Button size="sm" variant="secondary" onClick={onCancel}>
            cancel
          </Button>
          <Button size="sm" disabled={busy} onClick={onConfirm}>
            {busy ? "…" : "export anyway"}
          </Button>
        </div>
      </div>
    </div>
  );
}
