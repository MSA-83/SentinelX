// src/lib/api/alerts.ts
import { supabase } from "@/lib/supabase";
import type { DomainKey, SeverityLevel } from "@/types/entities";

export interface PersistedAlert {
  id: string;
  entity_id?: string;
  domain: DomainKey;
  severity: SeverityLevel;
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
  async list(limit = 100): Promise<PersistedAlert[]> {
    const { data, error } = await supabase
      .from("alerts_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  },

  async persist(alert: Omit<PersistedAlert, "id" | "created_at" | "acknowledged">): Promise<PersistedAlert> {
    const { data, error } = await supabase
      .from("alerts_history")
      .insert({ ...alert, acknowledged: false })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async acknowledge(id: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from("alerts_history")
      .update({ acknowledged: true, acknowledged_by: userId, acknowledged_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },

  async attachToCase(alertId: string, caseId: string): Promise<void> {
    const { error } = await supabase
      .from("alerts_history")
      .update({ case_id: caseId })
      .eq("id", alertId);
    if (error) throw error;
  },
};
