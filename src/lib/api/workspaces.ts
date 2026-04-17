// src/lib/api/workspaces.ts
import { supabase } from "@/lib/supabase";
import type { DomainKey } from "@/types/entities";

export interface DbWorkspace {
  id: string;
  name: string;
  classification: string;
  description?: string;
  active_domains: DomainKey[];
  filters: Record<string, unknown>;
  aoi?: Record<string, unknown>;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export const workspacesApi = {
  async list(): Promise<DbWorkspace[]> {
    const { data, error } = await supabase
      .from("workspaces")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async create(payload: Pick<DbWorkspace, "name" | "classification" | "active_domains"> & { created_by: string; description?: string }): Promise<DbWorkspace> {
    const { data, error } = await supabase
      .from("workspaces")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, payload: Partial<DbWorkspace>): Promise<DbWorkspace> {
    const { data, error } = await supabase
      .from("workspaces")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("workspaces").delete().eq("id", id);
    if (error) throw error;
  },
};
