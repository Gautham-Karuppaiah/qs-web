import { useParams, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./lib/api";
import { hexToDataUrl } from "./lib/bytea";
import { listImportedDrawingIds, listProjectPageThumbs } from "./lib/pages";
import { Input } from "@/components/ui/input";

type Drawing = {
  id: string;
  name: string;
  status: string;
  size_bytes: number | null;
  created_at: string;
};

export function Drawings() {
  const { orgId, projectId } = useParams({
    from: "/authed/orgLayout/orgs/$orgId/projects/$projectId/drawings",
  });

  const queryClient = useQueryClient();

  const drawings = useQuery({
    queryKey: ["drawings", projectId],
    queryFn: () => api<Drawing[]>(`/projects/${projectId}/drawings`),
  });

  const grid = useQuery({
    queryKey: ["projectGrid", projectId],
    queryFn: async () => {
      const [pages, imported] = await Promise.all([
        listProjectPageThumbs(projectId),
        listImportedDrawingIds(projectId),
      ]);
      return { pages, imported };
    },
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.type !== "application/pdf") throw new Error("not a pdf");
      if (file.size > 100 * 1024 * 1024) throw new Error("over 100 MB");

      const created = await api<{ drawing: Drawing; uploadUrl: string }>(
        `/projects/${projectId}/drawings`,
        {
          method: "POST",
          body: JSON.stringify({ name: file.name, size: file.size }),
        },
      );

      const put = await fetch(created.uploadUrl, {
        method: "PUT",
        headers: { "content-type": "application/pdf" },
        body: file,
      });
      if (!put.ok) throw new Error(`upload failed (${put.status})`);

      return api<Drawing>(`/drawings/${created.drawing.id}/complete`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drawings", projectId] });
    },
  });

  const unopened =
    drawings.data?.filter(
      (d) => d.status === "ready" && !grid.data?.imported.has(d.id),
    ) ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
        <Link
          to="/orgs/$orgId/projects"
          params={{ orgId }}
          className="text-xs text-muted-foreground hover:underline"
        >
          ← projects
        </Link>
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Pages
        </span>

        <div className="flex-1" />

        {upload.isPending && (
          <span className="shrink-0 text-xs text-muted-foreground">
            uploading
          </span>
        )}
        <Input
          type="file"
          accept="application/pdf"
          disabled={upload.isPending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) upload.mutate(file);
          }}
          className="h-7 w-64 py-0 text-xs"
        />
      </div>

      {upload.error && (
        <p className="border-b px-3 py-1.5 text-xs text-destructive">
          {upload.error.message}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
      {grid.isPending || drawings.isPending ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
          <div className="h-44 animate-pulse bg-muted" />
          <div className="h-44 animate-pulse bg-muted" />
          <div className="h-44 animate-pulse bg-muted" />
        </div>
      ) : grid.isError ? (
        <p className="text-sm text-destructive">{grid.error.message}</p>
      ) : !grid.data.pages.length && !unopened.length ? (
        <p className="text-sm text-muted-foreground">
          No pages yet. Upload a PDF above.
        </p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
          {grid.data.pages.map((p) => (
            <li key={p.id}>
              <Link
                to="/pages/$pageId"
                params={{ pageId: p.id }}
                onClick={() =>
                  queryClient.setQueryData(["pageLocation", p.id], {
                    drawing_id: p.drawing_id,
                    project_id: p.project_id,
                    org_id: p.org_id,
                  })
                }
                className="group flex flex-col gap-1"
              >
                <span className="flex aspect-[4/3] items-center justify-center overflow-hidden border bg-white group-hover:border-foreground/40">
                  {p.thumbnail ? (
                    <img
                      src={hexToDataUrl(p.thumbnail, "image/jpeg")}
                      alt=""
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      no preview
                    </span>
                  )}
                </span>
                <span className="truncate text-sm" title={p.name}>
                  {p.name}
                </span>
              </Link>
            </li>
          ))}

          {unopened.map((d) => (
            <li key={d.id}>
              <Link
                to="/drawings/$drawingId"
                params={{ drawingId: d.id }}
                className="group flex flex-col gap-1"
              >
                <span className="flex aspect-[4/3] items-center justify-center border border-dashed bg-muted/30 text-xs text-muted-foreground group-hover:border-foreground/40">
                  open to import pages
                </span>
                <span className="truncate text-sm" title={d.name}>
                  {d.name}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      </div>
    </div>
  );
}
