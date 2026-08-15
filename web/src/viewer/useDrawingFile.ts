import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export type Phase = [string, number];

export type DrawingMeta = {
  org_id: string;
  project_id: string;
  name: string;
};

export function useDrawingFile(drawingId: string) {
  return useQuery({
    queryKey: ["drawingFile", drawingId],
    staleTime: Infinity,
    queryFn: async () => {
      const phases: Phase[] = [];
      let t = performance.now();
      const { url, drawing } = await api<{
        url: string;
        drawing: DrawingMeta;
      }>(`/drawings/${drawingId}/url`);
      phases.push(["presigned url", Math.round(performance.now() - t)]);

      t = performance.now();
      const buffer = await fetch(url).then((r) => r.arrayBuffer());
      phases.push([
        `download ${(buffer.byteLength / 1048576).toFixed(1)} MB`,
        Math.round(performance.now() - t),
      ]);

      return { bytes: new Uint8Array(buffer), drawing, phases };
    },
  });
}
