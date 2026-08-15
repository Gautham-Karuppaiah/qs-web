import { supabase } from "./supabase";

export type Org = { id: string; name: string };

export async function listOrgs() {
  const { data, error } = await supabase
    .from("orgs")
    .select("id, name")
    .order("created_at");
  if (error) throw error;
  return data as Org[];
}

export async function createOrg(name: string) {
  const { data, error } = await supabase.rpc("create_org", { name });
  if (error) throw error;
  return data as string;
}
