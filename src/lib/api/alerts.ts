// src/lib/api/alerts.ts
import { supabase } from "@/lib/supabase";
import type { StreamEvent } from "@/types/entities";

export interface DbAlert {
  id: string;
  entity_id?: string;
  domain: string;
  severity: string;
  title: string;
  description?: string;
  position?: { lat: number; lon: number };
  acknowledged: boolean;
  acknowledged_by?: string;
  acknowledged_at?: string;
  case_id?: string;
  created_at: string;
}

export const alertsApi = {
  async list(limit = 100): Promise<DbAlert[]> {
    const { data, error } = await supabase
      .from("alerts_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  },

  async persist(event: StreamEvent): Promise<DbAlert | null> {
    const { data, error } = await supabase
      .from("alerts_history")
      .insert({
        entity_id: event.entityId,
        domain: event.domain,
        severity: event.severity,
        title: event.title,
        description: event.description,
        position: event.position,
        acknowledged: false,
      })
      .select()
      .single();
    if (error) {
      console.warn("Alert persist failed:", error.message);
      return null;
    }
    return data;
  },

  async acknowledge(id: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from("alerts_history")
      .update({
        acknowledged: true,
        acknowledged_by: userId,
        acknowledged_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw error;
  },

  async linkToCase(alertId: string, caseId: string): Promise<void> {
    const { error } = await supabase
      .from("alerts_history")
      .update({ case_id: caseId })
      .eq("id", alertId);
    if (error) throw error;
  },

  async getUnacknowledged(): Promise<DbAlert[]> {
    const { data, error } = await supabase
      .from("alerts_history")
      .select("*")
      .eq("acknowledged", false)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
};
