import { supabase } from "./supabase";

export type Marker = {
  id: string;
  legend_entry_id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
  source: string;
};

export type PageMarker = Marker & { page_id: string };

export type NewMarker = {
  id: string;
  page_id: string;
  legend_entry_id: string;
  org_id: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

const COLS = "id, legend_entry_id, x, y, w, h, angle, source";

export const toMarker = (row: NewMarker): PageMarker => ({
  id: row.id,
  page_id: row.page_id,
  legend_entry_id: row.legend_entry_id,
  x: row.x,
  y: row.y,
  w: row.w,
  h: row.h,
  angle: 0,
  source: "manual",
});

export async function listMarkers(pageId: string) {
  const { data, error } = await supabase
    .from("visible_markers")
    .select(COLS)
    .eq("page_id", pageId)
    .order("created_at");
  if (error) throw error;
  return data as Marker[];
}

export async function listMarkersForPages(pageIds: string[]) {
  if (!pageIds.length) return [];
  const { data, error } = await supabase
    .from("visible_markers")
    .select(`${COLS}, page_id`)
    .in("page_id", pageIds)
    .order("created_at");
  if (error) throw error;
  return data as PageMarker[];
}

export async function createMarker(row: NewMarker) {
  const { data: auth } = await supabase.auth.getSession();
  const { data, error } = await supabase
    .from("markers")
    .insert({
      ...row,
      source: "manual",
      created_by: auth.session?.user.id ?? null,
    })
    .select(COLS)
    .single();
  if (error) throw error;
  return data as Marker;
}

export async function setMarkerDeleted(id: string, deleted: boolean) {
  const { error } = await supabase
    .from("markers")
    .update({ deleted_at: deleted ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

export function markerAt<T extends Marker>(
  markers: T[],
  pos: { x: number; y: number },
) {
  for (let i = markers.length - 1; i >= 0; i--) {
    const m = markers[i];
    const cx = m.x + m.w / 2;
    const cy = m.y + m.h / 2;
    let dx = pos.x - cx;
    let dy = pos.y - cy;
    if (m.angle) {
      const a = (-m.angle * Math.PI) / 180;
      [dx, dy] = [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
    }
    if (Math.abs(dx) <= m.w / 2 && Math.abs(dy) <= m.h / 2) return m;
  }
  return null;
}
