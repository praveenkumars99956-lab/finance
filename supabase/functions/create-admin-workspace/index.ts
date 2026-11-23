// @ts-ignore Deno resolves this runtime type declaration, but some TypeScript
// language servers do not resolve jsr: specifiers used by Supabase Functions.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore Deno resolves this npm package at runtime, but some TypeScript
// language servers do not resolve npm: specifiers used by Supabase Functions.
import { withSupabase } from "npm:@supabase/server@^1";
import { createTenantAuthEmail } from "../_shared/tenantAuthEmail.ts";

export default {
  fetch: withSupabase(
    { auth: "none" },
    async (
      req: Request,
      ctx: { supabaseAdmin: any },
    ) => {
      const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json",
      };

      const respond = (
        body: Record<string, unknown>,
        status = 200,
      ) => new Response(JSON.stringify(body), { status, headers });

      if (req.method === "OPTIONS") {
        return new Response("ok", { headers });
      }

      if (req.method !== "POST") {
        return respond(
          { success: false, message: "Only POST is allowed." },
          405,
        );
      }

      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return respond(
          { success: false, message: "Invalid request data." },
          400,
        );
      }

      const fullName = String(body.full_name || "").trim();
      const workspaceName = String(body.workspace_name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!fullName || !workspaceName) {
        return respond(
          {
            success: false,
            message: "Admin name and workspace name are required.",
          },
          400,
        );
      }

      if (!emailPattern.test(email)) {
        return respond(
          { success: false, message: "Enter a valid email address." },
          400,
        );
      }

      if (password.length < 8) {
        return respond(
          {
            success: false,
            message: "Password must contain at least 8 characters.",
          },
          400,
        );
      }

      let authUserId: string | null = null;
      const workspaceId = crypto.randomUUID();
      let loginEmail: string;

      try {
        loginEmail = createTenantAuthEmail(email, workspaceId);

        const { data: authData, error: authError } =
          await ctx.supabaseAdmin.auth.admin.createUser({
            email: loginEmail,
            password,
            email_confirm: true,
            user_metadata: {
              full_name: fullName,
              role: "admin",
              contact_email: email,
              workspace_id: workspaceId,
            },
          });

        if (authError) {
          return respond(
            {
              success: false,
              message: authError.message ||
                "Unable to create the admin login.",
            },
            400,
          );
        }

        authUserId = authData?.user?.id || null;
        if (!authUserId) {
          throw new Error("Admin login was not created correctly.");
        }

        const { data: workspace, error: workspaceError } =
          await ctx.supabaseAdmin
            .from("workspaces")
            .insert({
              id: workspaceId,
              name: workspaceName,
              owner_user_id: authUserId,
            })
            .select("id")
            .single();

        if (workspaceError || workspace?.id !== workspaceId) {
          throw new Error(
            workspaceError?.message ||
              "Unable to create the admin workspace.",
          );
        }

        const { error: profileError } = await ctx.supabaseAdmin
          .from("profiles")
          .upsert(
            {
              id: authUserId,
              full_name: fullName,
              role: "admin",
              workspace_id: workspaceId,
            },
            { onConflict: "id" },
          );

        if (profileError) {
          throw new Error(
            profileError.message || "Unable to create the admin profile.",
          );
        }

        // The verified login email is authoritative for role and workspace.
        const { error: bindingError } = await ctx.supabaseAdmin
          .from("role_bindings")
          .upsert(
            {
              email: loginEmail.toLowerCase(),
              role: "admin",
              workspace_id: workspaceId,
              active: true,
              note: "Created with admin workspace",
            },
            { onConflict: "email" },
          );

        if (bindingError) {
          throw new Error(
            bindingError.message ||
              "Unable to create the admin access binding.",
          );
        }

        const { error: settingsError } = await ctx.supabaseAdmin
          .from("app_settings")
          .insert({
            workspace_id: workspaceId,
            business_name: workspaceName,
            currency_symbol: "₹",
            default_interest_rate: 0,
            overdue_grace_days: 0,
            require_gps: true,
            require_collection_proof: true,
            updated_at: new Date().toISOString(),
          });

        if (settingsError) {
          throw new Error(
            settingsError.message ||
              "Unable to initialize workspace settings.",
          );
        }

        return respond({
          success: true,
          message: "Admin workspace created.",
          login_email: loginEmail,
          workspace_id: workspaceId,
        });
      } catch (error) {
        console.error("Admin workspace creation failed:", error);

        if (workspaceId) {
          const { error: settingsCleanupError } = await ctx.supabaseAdmin
            .from("app_settings")
            .delete()
            .eq("workspace_id", workspaceId);
          if (settingsCleanupError) {
            console.error(
              "Workspace settings rollback failed:",
              settingsCleanupError,
            );
          }
        }

        if (workspaceId) {
          const { error: profileCleanupError } = await ctx.supabaseAdmin
            .from("profiles")
            .delete()
            .eq("id", authUserId);
          if (profileCleanupError) {
            console.error(
              "Admin profile rollback failed:",
              profileCleanupError,
            );
          }

          const { error: workspaceCleanupError } = await ctx.supabaseAdmin
            .from("workspaces")
            .delete()
            .eq("id", workspaceId);
          if (workspaceCleanupError) {
            console.error(
              "Workspace rollback failed:",
              workspaceCleanupError,
            );
          }
        }

        if (authUserId && !workspaceId) {
          const { error: profileCleanupError } = await ctx.supabaseAdmin
            .from("profiles")
            .delete()
            .eq("id", authUserId);
          if (profileCleanupError) {
            console.error(
              "Admin profile rollback failed:",
              profileCleanupError,
            );
          }

          const { error: orphanWorkspaceCleanupError } =
            await ctx.supabaseAdmin
              .from("workspaces")
              .delete()
              .eq("owner_user_id", authUserId);
          if (orphanWorkspaceCleanupError) {
            console.error(
              "Orphan workspace rollback failed:",
              orphanWorkspaceCleanupError,
            );
          }
        }

        if (authUserId) {
          const { error: authCleanupError } = await ctx.supabaseAdmin
            .auth.admin.deleteUser(authUserId);
          if (authCleanupError) {
            console.error("Admin login rollback failed:", authCleanupError);
          }
        }

        return respond(
          {
            success: false,
            message: error instanceof Error
              ? error.message
              : "Unable to create the admin workspace.",
          },
          500,
        );
      }
    },
  ),
};
