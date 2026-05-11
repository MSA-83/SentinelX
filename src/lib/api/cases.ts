// src/lib/api/cases.ts
import { supabase } from "@/lib/supabase";

export interface Case {
  id: string;
  case_number: string;
  title: string;
  description?: string;
  status: "OPEN" | "ACTIVE" | "PENDING" | "CLOSED" | "ARCHIVED";
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  classification: string;
  assigned_to?: string;
  created_by?: string;
  workspace_id?: string;
  tags: string[];
  entity_ids: string[];
  alert_ids: string[];
  evidence_urls: string[];
  closed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CaseNote {
  id: string;
  case_id: string;
  content: string;
  note_type: string;
  author_id?: string;
  created_at: string;
}

export const casesApi = {
  async list(): Promise<Case[]> {
    const { data, error } = await supabase
      .from("cases")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async get(id: string): Promise<Case | null> {
    const { data, error } = await supabase
      .from("cases")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },

  async create(payload: Partial<Case> & { title: string; created_by: string }): Promise<Case> {
    const { data, error } = await supabase
      .from("cases")
      .insert({ ...payload, case_number: "" })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, payload: Partial<Case>): Promise<Case> {
    const { data, error } = await supabase
      .from("cases")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async addNote(caseId: string, content: string, authorId: string, noteType = "ANALYST_NOTE"): Promise<CaseNote> {
    const { data, error } = await supabase
      .from("case_notes")
      .insert({ case_id: caseId, content, note_type: noteType, author_id: authorId })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getNotes(caseId: string): Promise<CaseNote[]> {
    const { data, error } = await supabase
      .from("case_notes")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },
};
