// src/lib/auth.ts
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  role: string;
  clearance: string;
  unit?: string;
  avatarColor: string;
}

export function mapSupabaseUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email!,
    username:
      user.user_metadata?.username ||
      user.user_metadata?.full_name ||
      user.email!.split("@")[0],
    role: user.user_metadata?.role ?? "ANALYST",
    clearance: user.user_metadata?.clearance_level ?? "SECRET",
    unit: user.user_metadata?.unit,
    avatarColor: user.user_metadata?.avatar_color ?? "#00d4ff",
  };
}

export const authService = {
  async sendOtp(email: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (error) throw error;
  },

  async verifyOtpAndSetPassword(
    email: string,
    token: string,
    password: string,
    username?: string
  ) {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });
    if (error) throw error;

    const { data: updateData, error: updateError } = await supabase.auth.updateUser({
      password,
      data: {
        username: username ?? email.split("@")[0],
        role: "ANALYST",
        clearance_level: "SECRET",
        avatar_color: "#00d4ff",
      },
    });
    if (updateError) throw updateError;
    return updateData.user!;
  },

  async signInWithPassword(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
};
