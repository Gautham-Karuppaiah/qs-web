import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { createRenderClient } from "./viewer/renderClient";
import { useDrawingFile } from "./viewer/useDrawingFile";
import {
  firstVisiblePage,
  listImportedIndexes,
  nextSortOrder,
  pageName,
  upsertPages,
} from "./lib/pages";

export function Import() {
  const { drawingId } = useParams({ from: "/authed/drawings/$drawingId" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const file = useDrawingFile(drawingId);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState<{ orgId: string; projectId: string } | null>(
    null,
  );

  useEffect(() => {
    const data = file.data;
    if (!data) return;

    const client = createRenderClient();
    let cancelled = false;

    (async () => {
      const info = await client.open(data.bytes);
      if (cancelled) return;

      const have = await listImportedIndexes(drawingId);
      if (cancelled) return;

      const missing = info.sizes
        .map((s, i) => ({ s, i }))
        .filter(({ i }) => !have.has(i));

      if (missing.length) {
        let order = await nextSortOrder(data.drawing.project_id);
        if (cancelled) return;
        await upsertPages(
          missing.map(({ s, i }) => ({
            drawing_id: drawingId,
            project_id: data.drawing.project_id,
            org_id: data.drawing.org_id,
            page_index: i,
            name: pageName(data.drawing.name, i, info.sizes.length),
            width_pt: s.width,
            height_pt: s.height,
            sort_order: (order += 1000),
          })),
        );
        if (cancelled) return;
        queryClient.invalidateQueries({
          queryKey: ["projectPages", data.drawing.project_id],
        });
        queryClient.invalidateQueries({
          queryKey: ["projectGrid", data.drawing.project_id],
        });
      }

      const first = await firstVisiblePage(drawingId);
      if (cancelled) return;
      if (first)
        navigate({
          to: "/pages/$pageId",
          params: { pageId: first.id },
          replace: true,
        });
      else
        setEmpty({
          orgId: data.drawing.org_id,
          projectId: data.drawing.project_id,
        });
    })().catch((e) => {
      if (!cancelled) setError(e instanceof Error ? e.message : String(e));
    });

    return () => {
      cancelled = true;
      client.destroy();
    };
  }, [file.data, drawingId, navigate, queryClient]);

  const message = error ?? file.error?.message;

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 p-6 text-sm">
      {message ? (
        <span className="text-destructive">{message}</span>
      ) : empty ? (
        <>
          <span className="text-muted-foreground">
            Every page of this file is in the trash.
          </span>
          <Link
            to="/orgs/$orgId/projects/$projectId/drawings"
            params={{ orgId: empty.orgId, projectId: empty.projectId }}
            className="underline"
          >
            back to project
          </Link>
        </>
      ) : (
        <span className="text-muted-foreground">importing pages…</span>
      )}
    </div>
  );
}
