import { supabase } from "./supabase";

export type Project = { id: string; name: string };

export async function listProjects(orgId: string) {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Project[];
}

export async function createProject(orgId: string, name: string) {
  const { error } = await supabase
    .from("projects")
    .insert({ name, org_id: orgId });
  if (error) throw error;
}

export async function getProject(id: string) {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as Project | null;
}
