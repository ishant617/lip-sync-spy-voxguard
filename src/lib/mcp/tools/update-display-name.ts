import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "update_display_name",
  title: "Update VoxGuard display name",
  description:
    "Update the signed-in VoxGuard user's display name on their profile. Does not change role or email.",
  inputSchema: {
    display_name: z.string().trim().min(1).max(80).describe("New display name."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ display_name }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };

    const supabase = supabaseForUser(ctx);
    const userId = ctx.getUserId();

    const existing = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing.error)
      return { content: [{ type: "text", text: existing.error.message }], isError: true };

    const upsert = existing.data
      ? await supabase
          .from("profiles")
          .update({ display_name })
          .eq("user_id", userId)
          .select("*")
          .single()
      : await supabase
          .from("profiles")
          .insert({ user_id: userId, display_name, role: "user" })
          .select("*")
          .single();

    if (upsert.error)
      return { content: [{ type: "text", text: upsert.error.message }], isError: true };

    return {
      content: [{ type: "text", text: `Display name updated to "${display_name}".` }],
      structuredContent: { profile: upsert.data },
    };
  },
});
