import { supabase } from "./supabase";
import type { Pt } from "./regions";

const COLS = "id, project_id, org_id, parent_id, page_id, name, geometry";

export type Section = {
  id: string;
  project_id: string;
  org_id: string;
  parent_id: string | null;
  page_id: string | null;
  name: string;
  geometry: Pt[] | null;
};

export type NewSection = {
  id?: string;
  project_id: string;
  org_id: string;
  parent_id?: string | null;
  page_id?: string | null;
  name: string;
  geometry?: Pt[] | null;
};

export type BoxShape = { id: string; name: string; geometry: Pt[] };

export const isBox = (s: Section) => s.geometry !== null;

export function boxAssignment(s: Section, byId: Map<string, Section>) {
  const parent = s.parent_id ? byId.get(s.parent_id) : null;
  if (!parent) return ["", ""] as const;
  const grand = parent.parent_id ? byId.get(parent.parent_id) : null;
  return grand ? ([grand.name, parent.name] as const) : ([parent.name, ""] as const);
}

export const groupLabel = (building: string, floor: string) =>
  building ? (floor ? `${building} / ${floor}` : building) : "Unassigned";

export type Assignment = { create: Section[]; parentId: string };

export function planAssignment(opts: {
  box: Section;
  building: string;
  floor: string;
  all: Section[];
}): Assignment {
  const { box, building, floor, all } = opts;
  const create: Section[] = [];
  const make = (name: string, parentId: string | null) => {
    const found =
      all.find((s) => !isBox(s) && s.parent_id === parentId && s.name === name) ??
      create.find((s) => s.parent_id === parentId && s.name === name);
    if (found) return found;
    const row: Section = {
      id: crypto.randomUUID(),
      project_id: box.project_id,
      org_id: box.org_id,
      parent_id: parentId,
      page_id: null,
      name,
      geometry: null,
    };
    create.push(row);
    return row;
  };
  let target = make(building, null);
  if (floor) target = make(floor, target.id);
  return { create, parentId: target.id };
}

export async function applyAssignment(boxId: string, plan: Assignment) {
  for (const row of plan.create) await createSection(row);
  await setSectionParent(boxId, plan.parentId);
}

export function boxesByPage(all: Section[], byId: Map<string, Section>) {
  const map = new Map<string, BoxShape[]>();
  for (const s of all) {
    if (!s.page_id || !isBox(s)) continue;
    const [building, floor] = boxAssignment(s, byId);
    const row = { id: s.id, name: groupLabel(building, floor), geometry: s.geometry! };
    const list = map.get(s.page_id);
    if (list) list.push(row);
    else map.set(s.page_id, [row]);
  }
  return map;
}

export function descendants(id: string, all: Section[]) {
  const out: Section[] = [];
  const walk = (parentId: string) => {
    for (const s of all)
      if (s.parent_id === parentId) {
        out.push(s);
        walk(s.id);
      }
  };
  walk(id);
  return out;
}

export async function listSections(projectId: string) {
  const { data, error } = await supabase
    .from("visible_sections")
    .select(COLS)
    .eq("project_id", projectId)
    .order("created_at");
  if (error) throw error;
  return data as Section[];
}

export async function createSection(row: NewSection) {
  const { data, error } = await supabase
    .from("sections")
    .insert(row)
    .select(COLS)
    .single();
  if (error) throw error;
  return data as Section;
}

export async function setSectionName(id: string, name: string) {
  const { error } = await supabase.from("sections").update({ name }).eq("id", id);
  if (error) throw error;
}

export async function setSectionParent(id: string, parentId: string | null) {
  const { error } = await supabase
    .from("sections")
    .update({ parent_id: parentId })
    .eq("id", id);
  if (error) throw error;
}

export async function setSectionDeleted(id: string, deleted: boolean) {
  const { error } = await supabase
    .from("sections")
    .update({ deleted_at: deleted ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}
