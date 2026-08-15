import { supabase } from "./supabase";
import { toHex } from "./bytea";

export const THUMB_EDGE = 256;

const COLS =
  "id, drawing_id, project_id, org_id, page_index, name, width_pt, height_pt, sort_order, finished_at";
const LIST_COLS = `${COLS}, thumbnail`;

export type PageRow = {
  drawing_id: string;
  project_id: string;
  org_id: string;
  page_index: number;
  name: string;
  width_pt: number;
  height_pt: number;
  sort_order: number;
};

export type Page = PageRow & { id: string; finished_at: string | null };
export type PageThumb = Page & { thumbnail: string | null };

export function pageName(fileName: string, index: number, total: number) {
  return total === 1 ? fileName : `${fileName} p${index + 1}`;
}

export async function listProjectPages(projectId: string) {
  const { data, error } = await supabase
    .from("visible_pages")
    .select(COLS)
    .eq("project_id", projectId)
    .order("sort_order");
  if (error) throw error;
  return data as Page[];
}

export async function listProjectPageThumbs(projectId: string) {
  const { data, error } = await supabase
    .from("visible_pages")
    .select(LIST_COLS)
    .eq("project_id", projectId)
    .order("sort_order");
  if (error) throw error;
  return data as PageThumb[];
}

export type PageLocation = {
  drawing_id: string;
  project_id: string;
  org_id: string;
};

export async function getPageLocation(id: string) {
  const { data, error } = await supabase
    .from("pages")
    .select("drawing_id, project_id, org_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as PageLocation | null;
}

export async function firstVisiblePage(drawingId: string) {
  const { data, error } = await supabase
    .from("visible_pages")
    .select(COLS)
    .eq("drawing_id", drawingId)
    .order("sort_order")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Page | null;
}

export async function listImportedIndexes(drawingId: string) {
  const { data, error } = await supabase
    .from("pages")
    .select("page_index")
    .eq("drawing_id", drawingId);
  if (error) throw error;
  return new Set((data as Array<{ page_index: number }>).map((r) => r.page_index));
}

export async function listImportedDrawingIds(projectId: string) {
  const { data, error } = await supabase
    .from("pages")
    .select("drawing_id")
    .eq("project_id", projectId);
  if (error) throw error;
  return new Set((data as Array<{ drawing_id: string }>).map((r) => r.drawing_id));
}

export async function listPagesNeedingThumb(drawingId: string) {
  const { data, error } = await supabase
    .from("visible_pages")
    .select("id, page_index")
    .eq("drawing_id", drawingId)
    .is("thumbnail", null)
    .order("page_index");
  if (error) throw error;
  return data as Array<{ id: string; page_index: number }>;
}

export async function setPageThumbnail(id: string, jpeg: ArrayBuffer) {
  const { error } = await supabase
    .from("pages")
    .update({ thumbnail: toHex(jpeg) })
    .eq("id", id);
  if (error) throw error;
}

export async function nextSortOrder(projectId: string) {
  const { data, error } = await supabase
    .from("pages")
    .select("sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data[0]?.sort_order ?? 0) + 1000;
}

export async function upsertPages(rows: PageRow[]) {
  const { data, error } = await supabase
    .from("pages")
    .upsert(rows, { onConflict: "drawing_id,page_index" })
    .select(COLS);
  if (error) throw error;
  return data as Page[];
}

export async function setPageDeleted(id: string, deleted: boolean) {
  const { error } = await supabase
    .from("pages")
    .update({ deleted_at: deleted ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

export async function setPageFinished(id: string, finished: boolean) {
  const { error } = await supabase
    .from("pages")
    .update({ finished_at: finished ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

export async function setPageName(id: string, name: string) {
  const { error } = await supabase.from("pages").update({ name }).eq("id", id);
  if (error) throw error;
}

export async function listTrashedPages(projectId: string) {
  const { data, error } = await supabase
    .from("pages")
    .select(`${COLS}, deleted_at`)
    .eq("project_id", projectId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (error) throw error;
  return data as Array<Page & { deleted_at: string }>;
}
