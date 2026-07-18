import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ProfileSchema = z.object({
  display_name: z.string().optional().nullable(),
  avatar_url: z.string().optional().nullable(),
  role: z.string().optional().nullable(),
});

export type Profile = {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string | null;
  created_at: string;
  updated_at: string;
};

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Profile | null> => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data as Profile | null;
  });

export const ensureProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ProfileSchema.parse(input))
  .handler(async ({ context, data }): Promise<Profile> => {
    const existing = await context.supabase
      .from("profiles")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (existing.error) throw new Error(existing.error.message);

    if (existing.data) {
      const { data: updated, error } = await context.supabase
        .from("profiles")
        .update({
          display_name: data.display_name,
          avatar_url: data.avatar_url,
          role: data.role,
        })
        .eq("user_id", context.userId)
        .select("*")
        .single();

      if (error) throw new Error(error.message);
      return updated as Profile;
    }

    const { data: inserted, error } = await context.supabase
      .from("profiles")
      .insert({
        user_id: context.userId,
        display_name: data.display_name,
        avatar_url: data.avatar_url,
        role: data.role,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return inserted as Profile;
  });
