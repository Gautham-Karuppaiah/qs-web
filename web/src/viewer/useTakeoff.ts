import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listProjectPages,
  setPageDeleted,
  setPageFinished,
  setPageName,
  type Page,
} from "../lib/pages";
import {
  CROP_DPI,
  createLegendEntry,
  entryColor,
  listLegendEntries,
  setLegendEntryDeleted,
  setLegendEntryLabel,
  type LegendEntry,
} from "../lib/legend";
import {
  createMarker,
  listMarkersForPages,
  setMarkerDeleted,
  toMarker,
  type NewMarker,
  type PageMarker,
} from "../lib/markers";
import {
  applyAssignment,
  boxesByPage as boxesByPageOf,
  createSection,
  descendants,
  listSections,
  planAssignment,
  setSectionDeleted,
  setSectionName,
  type Assignment,
  type Section,
} from "../lib/sections";
import {
  createZone,
  listZones,
  setZoneDeleted,
  type Zone,
} from "../lib/zones";
import { getProject } from "../lib/projects";
import {
  rectPoints,
  tally,
  untrackedByPage,
  zonesByBox,
  type Box,
  type Pt,
} from "../lib/regions";
import { dropCmd, dropEntry, push, type Cmd } from "../lib/history";
import { dropRows, optimistic, patchRow } from "../lib/optimistic";
import type { PageBox } from "./DrawingsPanel";
import type { createRenderClient } from "./renderClient";

type Client = ReturnType<typeof createRenderClient>;
export type Trashed = { label: string; restore: () => Promise<void> };

export function useTakeoff({
  pageId,
  projectId,
  orgId,
}: {
  pageId: string;
  projectId: string;
  orgId: string;
}) {
  const qc = useQueryClient();
  const [trashed, setTrashed] = useState<Trashed | null>(null);

  const key = {
    pages: ["projectPages", projectId],
    grid: ["projectGrid", projectId],
    legend: ["legend", projectId],
    markers: ["projectMarkers", projectId],
    sections: ["sections", projectId],
    zones: ["zones", pageId],
  };

  const projectPages = useQuery({
    queryKey: key.pages,
    queryFn: () => listProjectPages(projectId),
  });
  const pages = projectPages.data ?? null;
  const page = pages?.find((p) => p.id === pageId) ?? null;

  const legend = useQuery({
    queryKey: key.legend,
    queryFn: () => listLegendEntries(projectId),
  });

  const project = useQuery({
    queryKey: ["project", projectId],
    staleTime: Infinity,
    queryFn: () => getProject(projectId),
  });

  const pageIds = useMemo(() => (pages ?? []).map((p) => p.id), [pages]);

  const markers = useQuery({
    queryKey: key.markers,
    enabled: !!pages,
    queryFn: () => listMarkersForPages(pageIds),
  });

  const sections = useQuery({
    queryKey: key.sections,
    queryFn: () => listSections(projectId),
  });

  const zones = useQuery({
    queryKey: key.zones,
    enabled: !!page,
    queryFn: () => listZones(pageId),
  });

  const allMarkers = useMemo(() => markers.data ?? [], [markers.data]);
  const allSections = useMemo(() => sections.data ?? [], [sections.data]);
  const zoneList = useMemo(() => zones.data ?? [], [zones.data]);

  const pageMarkers = useMemo(
    () => allMarkers.filter((m) => m.page_id === pageId),
    [allMarkers, pageId],
  );

  const sectionById = useMemo(
    () => new Map(allSections.map((s) => [s.id, s])),
    [allSections],
  );

  const boxesByPage = useMemo(
    () => boxesByPageOf(allSections, sectionById),
    [allSections, sectionById],
  );

  const boxShapes = useMemo(
    () => boxesByPage.get(pageId) ?? [],
    [boxesByPage, pageId],
  );

  const zoneShapes = useMemo(
    () => zoneList.map((z) => ({ id: z.id, name: z.name, geometry: z.geometry })),
    [zoneList],
  );

  const untrackedOfPage = useMemo(
    () => untrackedByPage(allMarkers, boxesByPage),
    [allMarkers, boxesByPage],
  );

  const boxesOfPage = useMemo(() => {
    const map = new Map<string, PageBox[]>();
    for (const [id, list] of boxesByPage)
      map.set(
        id,
        list.map((b) => ({ id: b.id, label: b.name })),
      );
    return map;
  }, [boxesByPage]);

  const pageNameOf = useMemo(
    () => new Map((pages ?? []).map((p) => [p.id, p.name])),
    [pages],
  );

  const { counts: regionCounts, untracked } = useMemo(
    () => tally(pageMarkers, boxShapes, zoneShapes),
    [pageMarkers, boxShapes, zoneShapes],
  );

  const zonesOfBox = useMemo(
    () => zonesByBox(boxShapes, zoneShapes),
    [boxShapes, zoneShapes],
  );

  const colorOf = useMemo(
    () =>
      new Map((legend.data ?? []).map((e) => [e.id, entryColor(e.id)] as const)),
    [legend.data],
  );

  const entryCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of pageMarkers)
      map.set(m.legend_entry_id, (map.get(m.legend_entry_id) ?? 0) + 1);
    return map;
  }, [pageMarkers]);

  const renamePage = useMutation({
    mutationFn: ({ page, name }: { page: Page; name: string }) =>
      setPageName(page.id, name),
    ...optimistic<Page, { page: Page; name: string }>({
      client: qc,
      key: () => key.pages,
      apply: (rows, { page, name }) => patchRow(rows, page.id, { name }),
      extra: () => [key.grid],
    }),
  });

  const finishPage = useMutation({
    mutationFn: ({ page, finished }: { page: Page; finished: boolean }) =>
      setPageFinished(page.id, finished),
    ...optimistic<Page, { page: Page; finished: boolean }>({
      client: qc,
      key: () => key.pages,
      apply: (rows, { page, finished }) =>
        patchRow(rows, page.id, {
          finished_at: finished ? new Date().toISOString() : null,
        }),
      extra: () => [key.grid],
    }),
  });

  const trashPage = useMutation({
    mutationFn: (p: Page) => setPageDeleted(p.id, true),
    ...optimistic<Page, Page>({
      client: qc,
      key: () => key.pages,
      apply: (rows, p) => dropRows(rows, p.id),
      side: (p) => {
        if (p.id !== pageId)
          setTrashed({
            label: p.name,
            restore: () => setPageDeleted(p.id, false),
          });
      },
      extra: () => [key.grid, key.markers],
    }),
  });

  const undelete = useMutation({
    mutationFn: () => setPageDeleted(pageId, false),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key.pages });
      qc.invalidateQueries({ queryKey: key.grid });
    },
  });

  const renameEntry = useMutation({
    mutationFn: ({ entry, label }: { entry: LegendEntry; label: string }) =>
      setLegendEntryLabel(entry.id, label),
    ...optimistic<LegendEntry, { entry: LegendEntry; label: string }>({
      client: qc,
      key: () => key.legend,
      apply: (rows, { entry, label }) => patchRow(rows, entry.id, { label }),
    }),
  });

  const trashEntry = useMutation({
    mutationFn: (entry: LegendEntry) => setLegendEntryDeleted(entry.id, true),
    ...optimistic<LegendEntry, LegendEntry>({
      client: qc,
      key: () => key.legend,
      apply: (rows, entry) => dropRows(rows, entry.id),
      side: (entry) => {
        qc.setQueryData<PageMarker[]>(key.markers, (old) =>
          (old ?? []).filter((m) => m.legend_entry_id !== entry.id),
        );
        dropEntry(entry.id);
        setTrashed({
          label: entry.label,
          restore: () => setLegendEntryDeleted(entry.id, false),
        });
      },
      extra: () => [key.markers],
    }),
  });

  const addEntry = useMutation({
    mutationFn: ({
      client,
      box,
      label,
    }: {
      client: Client;
      box: Box;
      label: string;
    }) =>
      client
        .crop({ ...box, dpi: CROP_DPI })
        .then(({ png }) =>
          createLegendEntry({ project_id: projectId, org_id: orgId, label, png }),
        ),
    onSuccess: () => qc.invalidateQueries({ queryKey: key.legend }),
  });

  const restoreTrashed = useMutation({
    mutationFn: async () => {
      await trashed?.restore();
    },
    onSuccess: () => {
      setTrashed(null);
      for (const k of Object.values(key)) qc.invalidateQueries({ queryKey: k });
    },
  });

  const addMarker = useMutation({
    mutationFn: createMarker,
    ...optimistic<PageMarker, NewMarker>({
      client: qc,
      key: () => key.markers,
      apply: (rows, row) => [...rows, toMarker(row)],
      settle: false,
      side: (row) => {
        push(pageId, {
          kind: "marker",
          present: true,
          rows: [toMarker(row)],
          entryId: row.legend_entry_id,
        });
        return () => dropCmd(pageId, row.id);
      },
    }),
  });

  const removeMarker = useMutation({
    mutationFn: (m: PageMarker) => setMarkerDeleted(m.id, true),
    ...optimistic<PageMarker, PageMarker>({
      client: qc,
      key: () => key.markers,
      apply: (rows, m) => dropRows(rows, m.id),
      settle: false,
      side: (m) => {
        push(pageId, {
          kind: "marker",
          present: false,
          rows: [m],
          entryId: m.legend_entry_id,
        });
        return () => dropCmd(pageId, m.id);
      },
    }),
  });

  const newSection = (b: Box): Section => ({
    id: crypto.randomUUID(),
    project_id: projectId,
    org_id: orgId,
    parent_id: null,
    page_id: pageId,
    name: "",
    geometry: rectPoints(b),
  });

  const addSection = useMutation({
    mutationFn: (s: Section) => createSection(s),
    ...optimistic<Section, Section>({
      client: qc,
      key: () => key.sections,
      apply: (rows, s) => [...rows, s],
      side: (s) => {
        push(pageId, { kind: "section", present: true, rows: [s] });
        return () => dropCmd(pageId, s.id);
      },
    }),
  });

  const addGroup = useMutation({
    mutationFn: (s: Section) => createSection(s),
    ...optimistic<Section, Section>({
      client: qc,
      key: () => key.sections,
      apply: (rows, s) => [...rows, s],
      side: (s) => {
        push(pageId, { kind: "section", present: true, rows: [s] });
        return () => dropCmd(pageId, s.id);
      },
    }),
  });

  const renameSection = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      setSectionName(id, name),
    ...optimistic<Section, { id: string; name: string }>({
      client: qc,
      key: () => key.sections,
      apply: (rows, { id, name }) => patchRow(rows, id, { name }),
    }),
  });

  const assignBox = useMutation({
    mutationFn: ({ box, plan }: { box: Section; plan: Assignment }) =>
      applyAssignment(box.id, plan),
    ...optimistic<Section, { box: Section; plan: Assignment }>({
      client: qc,
      key: () => key.sections,
      apply: (rows, { box, plan }) =>
        patchRow([...rows, ...plan.create], box.id, {
          parent_id: plan.parentId,
        }),
    }),
  });

  const trashSection = useMutation({
    mutationFn: (s: Section) => setSectionDeleted(s.id, true),
    ...optimistic<Section, Section>({
      client: qc,
      key: () => key.sections,
      apply: (rows, s) =>
        dropRows(rows, new Set([s.id, ...descendants(s.id, rows).map((d) => d.id)])),
      side: (s) => {
        const rows = [s, ...descendants(s.id, allSections)];
        push(pageId, { kind: "section", present: false, rows });
        setTrashed({
          label: s.name || "section",
          restore: () => setSectionDeleted(s.id, false),
        });
        return () => dropCmd(pageId, s.id);
      },
    }),
  });

  const addZone = useMutation({
    mutationFn: (z: Zone) => createZone(z),
    ...optimistic<Zone, Zone>({
      client: qc,
      key: () => key.zones,
      apply: (rows, z) => [...rows, z],
      side: (z) => {
        push(pageId, { kind: "zone", present: true, rows: [z] });
        return () => dropCmd(pageId, z.id);
      },
    }),
  });

  const trashZone = useMutation({
    mutationFn: (z: Zone) => setZoneDeleted(z.id, true),
    ...optimistic<Zone, Zone>({
      client: qc,
      key: () => key.zones,
      apply: (rows, z) => dropRows(rows, z.id),
      side: (z) => {
        push(pageId, { kind: "zone", present: false, rows: [z] });
        setTrashed({
          label: z.name,
          restore: () => setZoneDeleted(z.id, false),
        });
        return () => dropCmd(pageId, z.id);
      },
    }),
  });

  const cmdKey = (cmd: Cmd) =>
    cmd.kind === "marker"
      ? key.markers
      : cmd.kind === "zone"
        ? ["zones", cmd.rows[0].page_id]
        : key.sections;

  const applyCmd = async (cmd: Cmd, present: boolean) => {
    const k = cmdKey(cmd);
    const ids = new Set(cmd.rows.map((r) => r.id));
    qc.setQueryData<Array<{ id: string }>>(k, (old) => {
      const rows = (old ?? []).filter((r) => !ids.has(r.id));
      return present ? [...rows, ...cmd.rows] : rows;
    });
    const write =
      cmd.kind === "marker"
        ? setMarkerDeleted
        : cmd.kind === "zone"
          ? setZoneDeleted
          : setSectionDeleted;
    try {
      await write(cmd.rows[0].id, !present);
      if (cmd.kind !== "marker") qc.invalidateQueries({ queryKey: k });
    } catch (e) {
      console.error("history", e);
      qc.invalidateQueries({ queryKey: k });
    }
  };

  return {
    pages,
    page,
    legend,
    project,
    sections,
    trashed,
    setTrashed,
    markersReady: !!markers.data,
    pagesPending: projectPages.isPending,
    allSections,
    zoneList,
    sectionById,
    pageMarkers,
    boxShapes,
    zoneShapes,
    boxesOfPage,
    untrackedOfPage,
    pageNameOf,
    regionCounts,
    zonesOfBox,
    untrackedCount: boxShapes.length ? untracked.length : 0,
    colorOf,
    entryCounts,
    allMarkers,
    newSection,
    planAssignment,
    applyCmd,
    mut: {
      renamePage,
      finishPage,
      trashPage,
      undelete,
      renameEntry,
      trashEntry,
      addEntry,
      restoreTrashed,
      addMarker,
      removeMarker,
      addSection,
      addGroup,
      renameSection,
      assignBox,
      trashSection,
      addZone,
      trashZone,
    },
  };
}

export type Takeoff = ReturnType<typeof useTakeoff>;

export const newZoneRow = (opts: {
  pageId: string;
  projectId: string;
  orgId: string;
  name: string;
  geometry: Pt[];
}): Zone => ({
  id: crypto.randomUUID(),
  page_id: opts.pageId,
  project_id: opts.projectId,
  org_id: opts.orgId,
  name: opts.name,
  geometry: opts.geometry,
});

export const newGroupRow = (opts: {
  projectId: string;
  orgId: string;
  name: string;
  parentId: string | null;
}): Section => ({
  id: crypto.randomUUID(),
  project_id: opts.projectId,
  org_id: opts.orgId,
  parent_id: opts.parentId,
  page_id: null,
  name: opts.name,
  geometry: null,
});
