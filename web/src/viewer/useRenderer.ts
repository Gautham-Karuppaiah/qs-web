import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createRenderClient } from "./renderClient";
import { useDrawingFile, type Phase } from "./useDrawingFile";
import {
  listPagesNeedingThumb,
  setPageThumbnail,
  THUMB_EDGE,
  type Page,
} from "../lib/pages";

export type Client = ReturnType<typeof createRenderClient>;

export function useRenderer({
  drawingId,
  projectId,
  page,
}: {
  drawingId: string;
  projectId: string;
  page: Page | null;
}) {
  const queryClient = useQueryClient();
  const file = useDrawingFile(drawingId);

  const [client, setClient] = useState<Client | null>(null);
  const [loadedIndex, setLoadedIndex] = useState<number | null>(null);
  const [localPhases, setLocalPhases] = useState<Phase[]>([]);

  useEffect(() => {
    const data = file.data;
    if (!data) return;

    const worker = createRenderClient();
    let cancelled = false;
    const t = performance.now();

    worker.open(data.bytes).then(() => {
      if (cancelled) return;
      setLocalPhases([["parse document", Math.round(performance.now() - t)]]);
      setClient(worker);
    });

    return () => {
      cancelled = true;
      setClient(null);
      setLoadedIndex(null);
      worker.destroy();
    };
  }, [file.data]);

  const wantIndex = page?.page_index ?? null;

  useEffect(() => {
    if (!client || wantIndex === null || loadedIndex === wantIndex) return;
    let cancelled = false;
    client.page(wantIndex).then(() => {
      if (!cancelled) setLoadedIndex(wantIndex);
    });
    return () => {
      cancelled = true;
    };
  }, [client, wantIndex, loadedIndex]);

  const ready = page !== null && loadedIndex === page.page_index;
  const width = page?.width_pt;
  const height = page?.height_pt;
  const index = page?.page_index;

  const doc = useMemo(
    () =>
      ready && width !== undefined && height !== undefined && index !== undefined
        ? { width, height, index }
        : null,
    [ready, width, height, index],
  );

  useEffect(() => {
    if (!client || !ready) return;
    let cancelled = false;
    (async () => {
      const todo = await listPagesNeedingThumb(drawingId);
      for (const p of todo) {
        if (cancelled) return;
        const { jpeg } = await client.thumb(p.page_index, THUMB_EDGE);
        if (cancelled || !jpeg) return;
        await setPageThumbnail(p.id, jpeg);
      }
      if (!cancelled)
        queryClient.invalidateQueries({ queryKey: ["projectGrid", projectId] });
    })().catch((e) => console.error("thumbnail", e));
    return () => {
      cancelled = true;
    };
  }, [client, ready, drawingId, projectId, queryClient]);

  const recordPaint = (ms: number) =>
    setLocalPhases((p) =>
      p.some(([l]) => l === "first tile") ? p : [...p, ["first tile", ms]],
    );

  return {
    file,
    client,
    doc,
    recordPaint,
    phases: [...(file.data?.phases ?? []), ...localPhases],
  };
}
