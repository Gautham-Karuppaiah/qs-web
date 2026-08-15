import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Canvas, type Box, type Tool } from "./viewer/Canvas";
import { DrawingsPanel } from "./viewer/DrawingsPanel";
import { SectionsPanel } from "./viewer/SectionsPanel";
import { CountsPanel } from "./viewer/CountsPanel";
import { AssignDialog } from "./viewer/AssignDialog";
import { LegendPanel } from "./viewer/LegendPanel";
import { ExportDialog } from "./viewer/ExportDialog";
import { Handle } from "./viewer/Dock";
import { useDockSize } from "./viewer/useDockSize";
import { useRenderer } from "./viewer/useRenderer";
import { useHistory } from "./viewer/useHistory";
import { newGroupRow, newZoneRow, useTakeoff } from "./viewer/useTakeoff";
import { getPageLocation } from "./lib/pages";
import { entrySize } from "./lib/legend";
import { markerAt } from "./lib/markers";
import type { Section } from "./lib/sections";
import { listProjectZones } from "./lib/zones";
import { buildSheet, preflight, type Preflight } from "./lib/export";
import { saveBlob, sheetToBlob } from "./lib/xlsx";
import { rectPoints, regionAt, type Pt } from "./lib/regions";
import { Button } from "@/components/ui/button";

const TOOLS: Array<[Tool, string, string]> = [
  ["pan", "pan", "Esc"],
  ["entry", "entry", "E"],
  ["mark", "marker", "M"],
  ["erase", "del marker", "D"],
  ["section", "section", "A"],
  ["zone", "zone", "Z"],
  ["poly", "zone poly", "⇧Z"],
  ["delzone", "del zone", "⇧D"],
];

const Centered = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-dvh flex-col items-center justify-center gap-3 p-6 text-sm">
    {children}
  </div>
);

export function Viewer() {
  const { pageId } = useParams({ from: "/authed/pages/$pageId" });

  const location = useQuery({
    queryKey: ["pageLocation", pageId],
    staleTime: Infinity,
    queryFn: () => getPageLocation(pageId),
  });

  if (location.isPending)
    return (
      <Centered>
        <span className="text-muted-foreground">loading</span>
      </Centered>
    );

  if (location.error)
    return (
      <Centered>
        <span className="text-destructive">{location.error.message}</span>
      </Centered>
    );

  if (!location.data)
    return (
      <Centered>
        <span className="text-muted-foreground">No such page.</span>
        <Link to="/" className="underline">
          back
        </Link>
      </Centered>
    );

  return (
    <ViewerFile
      key={location.data.drawing_id}
      pageId={pageId}
      drawingId={location.data.drawing_id}
      projectId={location.data.project_id}
      orgId={location.data.org_id}
    />
  );
}

function ViewerFile({
  pageId,
  drawingId,
  projectId,
  orgId,
}: {
  pageId: string;
  drawingId: string;
  projectId: string;
  orgId: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [tool, setTool] = useState<Tool>("pan");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [label, setLabel] = useState("");
  const [polygon, setPolygon] = useState<Pt[] | null>(null);
  const [polygonName, setPolygonName] = useState("");
  const [assigning, setAssigning] = useState<Section | null>(null);
  const [reviewing, setReviewing] = useState<Preflight | null>(null);
  const [leftTab, setLeftTab] = useState<"drawings" | "sections">("drawings");

  const [leftWidth, resizeLeft] = useDockSize("left", 240);
  const [rightWidth, resizeRight] = useDockSize("right", 240);
  const [countsHeight, resizeCounts] = useDockSize("counts", 180);

  const t = useTakeoff({ pageId, projectId, orgId });
  const { page, trashed, setTrashed, mut } = t;

  const { file, client, doc, recordPaint } = useRenderer({
    drawingId,
    projectId,
    page,
  });

  const history = useHistory(pageId, t.applyCmd);

  const clearBand = () => {
    setBox(null);
    setLabel("");
  };

  const runExport = useMutation({
    mutationFn: async () => {
      const projectZones = await listProjectZones(projectId);
      const sheet = buildSheet(
        t.legend.data ?? [],
        t.allSections,
        projectZones,
        t.allMarkers,
      );
      saveBlob(
        await sheetToBlob(sheet),
        `${t.project.data?.name ?? "counts"}.xlsx`,
      );
    },
    onSuccess: () => setReviewing(null),
  });

  const startExport = () => {
    const checks = preflight(t.pages ?? [], t.allSections, t.allMarkers);
    if (checks.untracked.length || checks.unfinished.length)
      return setReviewing(checks);
    runExport.mutate();
  };

  const place = (pos: { x: number; y: number }) => {
    const entry = t.legend.data?.find((e) => e.id === activeId);
    if (!entry?.image || !page) return;
    const { w, h } = entrySize(entry.image);
    mut.addMarker.mutate({
      id: crypto.randomUUID(),
      page_id: pageId,
      legend_entry_id: entry.id,
      org_id: orgId,
      x: pos.x - w / 2,
      y: pos.y - h / 2,
      w,
      h,
    });
  };

  const commitZone = (name: string, geometry: Pt[]) => {
    mut.addZone.mutate(newZoneRow({ pageId, projectId, orgId, name, geometry }));
    setPolygon(null);
    setPolygonName("");
    clearBand();
  };

  const bandPending = mut.addEntry.isPending || mut.addZone.isPending;
  const bandReady = !!box && label.trim().length > 0;

  const commitBand = () => {
    if (!bandReady || !box) return;
    if (tool === "zone") return commitZone(label.trim(), rectPoints(box));
    if (!client) return;
    mut.addEntry.mutate(
      { client, box, label: label.trim() },
      { onSuccess: clearBand },
    );
  };

  const pickTool = (next: Tool) => {
    clearBand();
    setPolygon(null);
    setTool(next);
  };

  const onPoint = (pos: { x: number; y: number }) => {
    if (tool === "mark") return place(pos);
    if (tool === "erase") {
      const hit = markerAt(t.pageMarkers, pos);
      if (hit) mut.removeMarker.mutate(hit);
      return;
    }
    if (tool === "delzone") {
      const hit = regionAt(t.zoneShapes, pos.x, pos.y);
      const zone = hit && t.zoneList.find((z) => z.id === hit.id);
      if (zone) mut.trashZone.mutate(zone);
    }
  };

  const openPage = (p: { id: string; drawing_id: string }) => {
    queryClient.setQueryData(["pageLocation", p.id], {
      drawing_id: p.drawing_id,
      project_id: projectId,
      org_id: orgId,
    });
    navigate({ to: "/pages/$pageId", params: { pageId: p.id } });
  };

  const actions = useRef({ pickTool, history, startExport });
  actions.current = { pickTool, history, startExport };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
        return;
      const k = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (k === "z" && !e.shiftKey) {
          e.preventDefault();
          actions.current.history.undo();
        } else if (k === "y" || (k === "z" && e.shiftKey)) {
          e.preventDefault();
          actions.current.history.redo();
        } else if (k === "e") {
          e.preventDefault();
          actions.current.startExport();
        }
        return;
      }
      if (e.altKey) return;
      if (e.key === "Escape") {
        e.preventDefault();
        actions.current.pickTool("pan");
        return;
      }
      const keys: Record<string, Tool> = e.shiftKey
        ? { z: "poly", d: "delzone" }
        : { e: "entry", m: "mark", d: "erase", a: "section", z: "zone" };
      const next = keys[k];
      if (!next) return;
      e.preventDefault();
      actions.current.pickTool(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-background">
      <header
        data-ui
        className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2"
      >
        <Link
          to="/orgs/$orgId/projects/$projectId/drawings"
          params={{ orgId, projectId }}
          className="max-w-64 truncate text-xs text-muted-foreground hover:underline"
          title={t.project.data?.name}
        >
          ← {t.project.data?.name ?? "pages"}
        </Link>
        {page && (
          <span
            className="max-w-64 truncate text-sm font-medium"
            title={page.name}
          >
            {page.name}
          </span>
        )}

        <div className="mx-1 h-5 w-px bg-border" />

        {TOOLS.map(([id, text, key]) => (
          <Button
            key={id}
            size="sm"
            title={`${text} (${key})`}
            disabled={(id === "mark" && !activeId) || !doc}
            variant={tool === id ? "default" : "outline"}
            onClick={() => pickTool(id)}
          >
            {text}
          </Button>
        ))}

        <div className="mx-1 h-5 w-px bg-border" />

        <Button
          size="sm"
          variant="outline"
          disabled={!history.canUndo}
          onClick={history.undo}
          title="undo (Ctrl+Z)"
        >
          undo
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!history.canRedo}
          onClick={history.redo}
          title="redo (Ctrl+Y)"
        >
          redo
        </Button>

        <Button
          size="sm"
          variant="outline"
          title="export counts to Excel (Ctrl+E)"
          disabled={runExport.isPending}
          onClick={startExport}
        >
          {runExport.isPending ? "exporting…" : "export"}
        </Button>

        <div className="flex-1" />

        {runExport.error && (
          <span className="text-sm text-destructive">
            {runExport.error.message}
          </span>
        )}
        {file.isPending && (
          <span className="text-sm text-muted-foreground">loading</span>
        )}
        {file.error && (
          <span className="text-sm text-destructive">{file.error.message}</span>
        )}
        {mut.addEntry.error && (
          <span className="text-sm text-destructive">
            {mut.addEntry.error.message}
          </span>
        )}

      </header>

      <div className="flex min-h-0 flex-1">
        <div
          data-ui
          style={{ width: leftWidth }}
          className="flex min-h-0 shrink-0 flex-col bg-background"
        >
          <div className="flex shrink-0 border-b">
            {(["drawings", "sections"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setLeftTab(tab)}
                className={`flex-1 border-b-2 px-2 py-1 text-xs uppercase tracking-wide ${
                  leftTab === tab
                    ? "border-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:bg-muted/60"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {leftTab === "drawings" ? (
            <DrawingsPanel
              pages={t.pages}
              currentPageId={pageId}
              boxesOfPage={t.boxesOfPage}
              untrackedOfPage={t.untrackedOfPage}
              busy={mut.trashPage.isPending || mut.trashSection.isPending}
              onOpen={openPage}
              onRename={(page, name) => mut.renamePage.mutate({ page, name })}
              onTrash={(p) => mut.trashPage.mutate(p)}
              onFinish={(page, finished) =>
                mut.finishPage.mutate({ page, finished })
              }
              onEditBox={(id) => setAssigning(t.sectionById.get(id) ?? null)}
              onTrashBox={(id) => {
                const s = t.sectionById.get(id);
                if (s) mut.trashSection.mutate(s);
              }}
            />
          ) : (
            <SectionsPanel
              sections={t.sections.data ?? null}
              currentPageId={pageId}
              pageNameOf={t.pageNameOf}
              busy={mut.trashSection.isPending}
              onOpenPage={(id) => {
                const p = t.pages?.find((x) => x.id === id);
                if (p) openPage(p);
              }}
              onAddGroup={(name, parentId) =>
                mut.addGroup.mutate(
                  newGroupRow({ projectId, orgId, name, parentId }),
                )
              }
              onRename={(id, name) => mut.renameSection.mutate({ id, name })}
              onEditBox={(id) => setAssigning(t.sectionById.get(id) ?? null)}
              onTrash={(s) => mut.trashSection.mutate(s)}
            />
          )}
        </div>

        <Handle axis="x" onResize={resizeLeft} />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {page || t.pagesPending ? (
            <Canvas
              doc={doc}
              client={client}
              tool={tool}
              box={box}
              markers={t.pageMarkers}
              boxes={t.boxShapes}
              zones={t.zoneShapes}
              colorOf={t.colorOf}
              onPoint={onPoint}
              onBox={(b) => {
                setBox(b);
                if (b && tool === "section") {
                  const section = t.newSection(b);
                  mut.addSection.mutate(section, {
                    onSuccess: () => {
                      clearBand();
                      setTool("pan");
                      setAssigning(section);
                    },
                  });
                }
              }}
              onPolygon={(points) => setPolygon(points)}
              onPainted={recordPaint}
              overlay={
                box &&
                tool !== "section" && (
                  <>
                    <input
                      autoFocus
                      value={label}
                      placeholder={tool === "zone" ? "zone name…" : "label…"}
                      onChange={(e) => setLabel(e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter") commitBand();
                        if (e.key === "Escape") clearBand();
                      }}
                      className="h-8 rounded-md border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                    />
                    <Button
                      size="sm"
                      disabled={!bandReady || bandPending}
                      onClick={commitBand}
                    >
                      {bandPending ? "…" : "add"}
                    </Button>
                  </>
                )
              }
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-sm">
              <span className="text-muted-foreground">
                This page is in the trash.
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={mut.undelete.isPending}
                onClick={() => mut.undelete.mutate()}
              >
                undo delete
              </Button>
            </div>
          )}

          <Handle axis="y" onResize={(d) => resizeCounts(-d)} />

          <div
            data-ui
            style={{ height: countsHeight }}
            className="flex shrink-0 flex-col bg-background"
          >
            <div className="shrink-0 border-b px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Counts
            </div>
            <CountsPanel
              entries={t.legend.data ?? null}
              boxes={t.boxShapes}
              zonesOfBox={t.zonesOfBox}
              counts={t.regionCounts}
              untracked={t.untrackedCount}
            />
          </div>
        </div>

        <Handle axis="x" onResize={(d) => resizeRight(-d)} />

        <div
          data-ui
          style={{ width: rightWidth }}
          className="flex min-h-0 shrink-0 flex-col bg-background"
        >
          <div className="shrink-0 border-b px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Legend
          </div>
          <LegendPanel
            entries={t.legend.data ?? null}
            counts={t.entryCounts}
            colorOf={t.colorOf}
            activeId={activeId}
            busy={mut.trashEntry.isPending}
            onSelect={(id) =>
              setActiveId((a) => {
                if (a !== id) return id;
                if (tool === "mark") setTool("pan");
                return null;
              })
            }
            onRename={(entry, label) => mut.renameEntry.mutate({ entry, label })}
            onTrash={(entry) => mut.trashEntry.mutate(entry)}
          />
        </div>
      </div>

      {polygon && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30">
          <div
            data-ui
            className="w-80 rounded-lg border bg-background p-4 shadow-xl"
          >
            <div className="mb-2 text-sm font-medium">
              New zone ({polygon.length} points)
            </div>
            <input
              autoFocus
              value={polygonName}
              placeholder="zone name…"
              onChange={(e) => setPolygonName(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Escape") setPolygon(null);
                if (e.key === "Enter" && polygonName.trim())
                  commitZone(polygonName.trim(), polygon);
              }}
              className="w-full rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPolygon(null)}
              >
                cancel
              </Button>
              <Button
                size="sm"
                disabled={!polygonName.trim() || mut.addZone.isPending}
                onClick={() => commitZone(polygonName.trim(), polygon)}
              >
                add
              </Button>
            </div>
          </div>
        </div>
      )}

      {reviewing && (
        <ExportDialog
          preflight={reviewing}
          busy={runExport.isPending}
          onOpenPage={(p) => {
            setReviewing(null);
            openPage(p);
          }}
          onCancel={() => setReviewing(null)}
          onConfirm={() => runExport.mutate()}
        />
      )}

      {assigning && (
        <AssignDialog
          box={assigning}
          sections={t.allSections}
          busy={mut.assignBox.isPending}
          onCancel={() => setAssigning(null)}
          onConfirm={(building, floor) =>
            mut.assignBox.mutate(
              {
                box: assigning,
                plan: t.planAssignment({
                  box: assigning,
                  building,
                  floor,
                  all: t.allSections,
                }),
              },
              { onSuccess: () => setAssigning(null) },
            )
          }
        />
      )}

      {trashed && (
        <div
          data-ui
          className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-md border bg-background px-3 py-2 text-sm shadow-lg"
        >
          <span className="max-w-64 truncate">deleted {trashed.label}</span>
          <Button
            size="sm"
            variant="outline"
            disabled={mut.restoreTrashed.isPending}
            onClick={() => mut.restoreTrashed.mutate()}
          >
            undo
          </Button>
          <button
            type="button"
            onClick={() => setTrashed(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
