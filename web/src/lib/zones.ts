import { supabase } from "./supabase";
import type { Pt } from "./regions";

const COLS = "id, page_id, project_id, org_id, name, geometry";

export type Zone = {
  id: string;
  page_id: string;
  project_id: string;
  org_id: string;
  name: string;
  geometry: Pt[];
};

export type NewZone = Omit<Zone, "id"> & { id?: string };

export async function listZones(pageId: string) {
  const { data, error } = await supabase
    .from("visible_zones")
    .select(COLS)
    .eq("page_id", pageId)
    .order("created_at");
  if (error) throw error;
  return data as Zone[];
}

export async function listProjectZones(projectId: string) {
  const { data, error } = await supabase
    .from("visible_zones")
    .select(COLS)
    .eq("project_id", projectId)
    .order("created_at");
  if (error) throw error;
  return data as Zone[];
}

export async function createZone(row: NewZone) {
  const { data, error } = await supabase
    .from("zones")
    .insert(row)
    .select(COLS)
    .single();
  if (error) throw error;
  return data as Zone;
}

export async function setZoneName(id: string, name: string) {
  const { error } = await supabase.from("zones").update({ name }).eq("id", id);
  if (error) throw error;
}

export async function setZoneDeleted(id: string, deleted: boolean) {
  const { error } = await supabase
    .from("zones")
    .update({ deleted_at: deleted ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}
