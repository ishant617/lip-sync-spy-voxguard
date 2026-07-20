import { auth, defineMcp } from "@lovable.dev/mcp-js";

import getProfileTool from "./tools/get-profile";
import updateDisplayNameTool from "./tools/update-display-name";
import whoamiTool from "./tools/whoami";

// Direct Supabase host — the .lovable.cloud proxy fails RFC 8414 issuer match.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "voxguard-mcp",
  title: "VoxGuard",
  version: "0.1.0",
  instructions:
    "VoxGuard tools — voice-fraud detection app. Use `whoami` to identify the signed-in user, `get_my_profile` to read their profile, and `update_display_name` to change their display name.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoamiTool, getProfileTool, updateDisplayNameTool],
});
