import { supabase } from "./supabase";
import { be32, toHex } from "./bytea";

export type LegendEntry = {
  id: string;
  label: string;
  image: string | null;
  auto_count: boolean;
};

export const CROP_DPI = 450;
const PX_PER_PT = CROP_DPI / 72;
export const entryColor = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 82% 47%)`;
};

export const entrySize = (hex: string) => ({
  w: be32(hex, 16) / PX_PER_PT,
  h: be32(hex, 20) / PX_PER_PT,
});

export { hexToDataUrl } from "./bytea";

export async function listLegendEntries(projectId: string) {
  const { data, error } = await supabase
    .from("visible_legend_entries")
    .select("id, label, image, auto_count")
    .eq("project_id", projectId)
    .order("created_at");
  if (error) throw error;
  return data as LegendEntry[];
}

export async function setLegendEntryDeleted(id: string, deleted: boolean) {
  const { error } = await supabase
    .from("legend_entries")
    .update({ deleted_at: deleted ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

export async function setLegendEntryLabel(id: string, label: string) {
  const { error } = await supabase
    .from("legend_entries")
    .update({ label })
    .eq("id", id);
  if (error) throw error;
}

export async function createLegendEntry(row: {
  project_id: string;
  org_id: string;
  label: string;
  png: ArrayBuffer;
}) {
  const { data, error } = await supabase
    .from("legend_entries")
    .insert({
      project_id: row.project_id,
      org_id: row.org_id,
      label: row.label,
      image: toHex(row.png),
    })
    .select("id, label, image, auto_count")
    .single();
  if (error) throw error;
  return data as LegendEntry;
}
