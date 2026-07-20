import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_my_profile",
  title: "Get my VoxGuard profile",
  description:
    "Return the signed-in VoxGuard user's profile (display name, avatar URL, role, timestamps).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };

    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, user_id, display_name, avatar_url, role, created_at, updated_at")
      .eq("user_id", ctx.getUserId())
      .maybeSingle();

    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };

    const profile = data ?? {
      user_id: ctx.getUserId(),
      email: ctx.getUserEmail(),
      display_name: null,
      avatar_url: null,
      role: "user",
      note: "No profile row yet — sign into the VoxGuard web app once to create it.",
    };

    return {
      content: [{ type: "text", text: JSON.stringify(profile, null, 2) }],
      structuredContent: { profile },
    };
  },
});
