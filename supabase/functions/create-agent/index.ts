// @ts-ignore Deno resolves this runtime type declaration, but some TypeScript
// language servers do not resolve jsr: specifiers used by Supabase Functions.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore Deno resolves this npm package at runtime, but some TypeScript
// language servers do not resolve npm: specifiers used by Supabase Functions.
import { withSupabase } from "npm:@supabase/server@^1";

const LEGACY_WORKSPACE_ID =
  "00000000-0000-4000-8000-000000000001";

export default {
  fetch: withSupabase(
    { auth: "user" },

    async (
      req: Request,
      ctx: {
        userClaims?: { id?: string };
        jwtClaims?: { sub?: string };
        supabaseAdmin: any;
      },
    ) => {
      // =========================================
      // CORS
      // =========================================

      if (req.method === "OPTIONS") {
        return new Response("ok", {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers":
              "authorization, x-client-info, apikey, content-type",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
          },
        });
      }

      const jsonResponse = (
        body: Record<string, unknown>,
        status = 200,
      ) => {
        return new Response(
          JSON.stringify(body),
          {
            status,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      };

      try {
        // =========================================
        // GET LOGGED-IN ADMIN USER ID
        // =========================================

        const loggedInUserId =
  ctx.jwtClaims?.sub;

        console.log(
          "Logged in user ID:",
          loggedInUserId,
        );

        if (!loggedInUserId) {
          return jsonResponse(
            {
              success: false,
              message: "Login required.",
            },
            401,
          );
        }

        // =========================================
        // VERIFY ADMIN ROLE
        // =========================================

        const {
          data: adminProfile,
          error: adminProfileError,
        } = await ctx.supabaseAdmin
          .from("profiles")
          .select("id, full_name, role, workspace_id")
          .eq("id", loggedInUserId)
          .single();

        if (adminProfileError) {
          console.error(
            "Admin profile error:",
            adminProfileError,
          );

          return jsonResponse(
            {
              success: false,
              message:
                "Unable to verify Admin profile.",
              details:
                adminProfileError.message,
            },
            403,
          );
        }

        if (!adminProfile) {
          return jsonResponse(
            {
              success: false,
              message:
                "Admin profile not found.",
            },
            403,
          );
        }

        if (adminProfile.role !== "admin") {
          return jsonResponse(
            {
              success: false,
              message:
                "Only Admin can create Agent accounts.",
            },
            403,
          );
        }

        const workspaceId =
          adminProfile.workspace_id || LEGACY_WORKSPACE_ID;

        // =========================================
        // READ REQUEST BODY
        // =========================================

        let body;

        try {
          body = await req.json();
        } catch {
          return jsonResponse(
            {
              success: false,
              message:
                "Invalid request data.",
            },
            400,
          );
        }

        const fullName =
          String(
            body.full_name || "",
          ).trim();

        const phone =
          String(
            body.phone || "",
          ).trim();

        const email =
          String(
            body.email || "",
          )
            .trim()
            .toLowerCase();

        const password =
          String(
            body.password || "",
          );

        const address =
          String(
            body.address || "",
          ).trim();

        const status =
          String(
            body.status || "active",
          ).trim();

        // =========================================
        // VALIDATION
        // =========================================

        if (!fullName) {
          return jsonResponse(
            {
              success: false,
              message:
                "Agent name is required.",
            },
            400,
          );
        }

        if (!email) {
          return jsonResponse(
            {
              success: false,
              message:
                "Agent email is required.",
            },
            400,
          );
        }

        const emailPattern =
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (
          !emailPattern.test(email)
        ) {
          return jsonResponse(
            {
              success: false,
              message:
                "Enter a valid email address.",
            },
            400,
          );
        }

        if (password.length < 6) {
          return jsonResponse(
            {
              success: false,
              message:
                "Temporary password must contain at least 6 characters.",
            },
            400,
          );
        }

        if (
          phone &&
          !/^[0-9]{10}$/.test(phone)
        ) {
          return jsonResponse(
            {
              success: false,
              message:
                "Phone number must contain exactly 10 digits.",
            },
            400,
          );
        }

        if (
          status !== "active" &&
          status !== "inactive"
        ) {
          return jsonResponse(
            {
              success: false,
              message:
                "Invalid Agent status.",
            },
            400,
          );
        }

        // =========================================
        // CHECK EXISTING AGENT EMAIL
        // =========================================

        let existingAgentQuery = ctx.supabaseAdmin
          .from("agents")
          .select("id, agent_id, email, auth_user_id")
          .eq("email", email);

        existingAgentQuery = workspaceId === LEGACY_WORKSPACE_ID
          ? existingAgentQuery.or(
            `workspace_id.eq.${workspaceId},workspace_id.is.null`,
          )
          : existingAgentQuery.eq("workspace_id", workspaceId);

        const {
          data: existingAgent,
          error: existingAgentError,
        } = await existingAgentQuery
          .maybeSingle();

        if (existingAgentError) {
          console.error(
            "Existing agent check error:",
            existingAgentError,
          );

          return jsonResponse(
            {
              success: false,
              message:
                "Unable to check existing Agent.",
              details:
                existingAgentError.message,
            },
            500,
          );
        }

        if (existingAgent) {
          return jsonResponse(
            {
              success: false,
              message:
                "An Agent with this email already exists.",
            },
            409,
          );
        }

        // =========================================
        // GENERATE UNIQUE AGENT ID
        // =========================================

        let agentId = "";

        let uniqueAgentIdFound =
          false;

        let attempts = 0;

        while (
          !uniqueAgentIdFound &&
          attempts < 10
        ) {
          attempts += 1;

          const randomPart =
            crypto
              .randomUUID()
              .replaceAll("-", "")
              .slice(0, 6)
              .toUpperCase();

          agentId =
            `AGT${randomPart}`;

          let existingIdQuery = ctx.supabaseAdmin
            .from("agents")
            .select("id")
            .eq("agent_id", agentId);

          existingIdQuery = workspaceId === LEGACY_WORKSPACE_ID
            ? existingIdQuery.or(
              `workspace_id.eq.${workspaceId},workspace_id.is.null`,
            )
            : existingIdQuery.eq("workspace_id", workspaceId);

          const {
            data: existingId,
            error: idCheckError,
          } = await existingIdQuery.maybeSingle();

          if (idCheckError) {
            console.error(
              "Agent ID check error:",
              idCheckError,
            );

            return jsonResponse(
              {
                success: false,
                message:
                  "Unable to generate Agent ID.",
              },
              500,
            );
          }

          if (!existingId) {
            uniqueAgentIdFound =
              true;
          }
        }

        if (!uniqueAgentIdFound) {
          return jsonResponse(
            {
              success: false,
              message:
                "Unable to generate unique Agent ID. Please try again.",
            },
            500,
          );
        }

        // =========================================
        // CREATE AUTH USER
        // =========================================

        const {
          data: authData,
          error: authError,
        } =
          await ctx.supabaseAdmin
            .auth.admin.createUser({
              email,
              password,

              email_confirm: true,

              user_metadata: {
                full_name:
                  fullName,

                role:
                  "agent",

                workspace_id:
                  workspaceId,
              },
            });

        if (authError) {
          console.error(
            "Create Auth user error:",
            authError,
          );

          return jsonResponse(
            {
              success: false,
              message:
                authError.message ||
                "Unable to create Agent login account.",
            },
            400,
          );
        }

        const newAuthUser =
          authData?.user;

        if (!newAuthUser?.id) {
          return jsonResponse(
            {
              success: false,
              message:
                "Agent login account was not created correctly.",
            },
            500,
          );
        }

        const newAuthUserId =
          newAuthUser.id;

        // =========================================
        // CREATE / UPDATE AGENT PROFILE
        // =========================================

        const {
          error: profileError,
        } = await ctx.supabaseAdmin
          .from("profiles")
          .upsert(
            {
              id:
                newAuthUserId,

              full_name:
                fullName,

              role:
                "agent",

              workspace_id:
                workspaceId,
            },
            {
              onConflict: "id",
            },
          );

        if (profileError) {
          console.error(
            "Profile creation error:",
            profileError,
          );

          // Roll back Auth user

          await ctx.supabaseAdmin
            .auth.admin.deleteUser(
              newAuthUserId,
            );

          return jsonResponse(
            {
              success: false,
              message:
                "Unable to create Agent profile.",
              details:
                profileError.message,
            },
            500,
          );
        }

        // =========================================
        // CREATE AGENT RECORD
        // =========================================

        const {
          data: newAgent,
          error: agentError,
        } = await ctx.supabaseAdmin
          .from("agents")
          .insert({
            agent_id:
              agentId,

            full_name:
              fullName,

            phone:
              phone || null,

            email:
              email,

            address:
              address || null,

            status:
              status,

            auth_user_id:
              newAuthUserId,

            workspace_id:
              workspaceId,

            created_by:
              loggedInUserId,
          })
          .select(
            `
              id,
              agent_id,
              full_name,
              phone,
              email,
              address,
              status,
              auth_user_id,
              created_at
            `,
          )
          .single();

        if (agentError) {
          console.error(
            "Agent table insert error:",
            agentError,
          );

          // =====================================
          // ROLLBACK PROFILE
          // =====================================

          await ctx.supabaseAdmin
            .from("profiles")
            .delete()
            .eq(
              "id",
              newAuthUserId,
            );

          // =====================================
          // ROLLBACK AUTH USER
          // =====================================

          await ctx.supabaseAdmin
            .auth.admin.deleteUser(
              newAuthUserId,
            );

          return jsonResponse(
            {
              success: false,
              message:
                "Unable to save Agent information.",
              details:
                agentError.message,
            },
            500,
          );
        }

        // =========================================
        // SUCCESS
        // =========================================

        console.log(
          "Agent created successfully:",
          newAgent.agent_id,
        );

        return jsonResponse(
          {
            success: true,

            message:
              "Agent created successfully.",

            agent: {
              id:
                newAgent.id,

              agent_id:
                newAgent.agent_id,

              full_name:
                newAgent.full_name,

              phone:
                newAgent.phone,

              email:
                newAgent.email,

              address:
                newAgent.address,

              status:
                newAgent.status,

              auth_user_id:
                newAgent.auth_user_id,

              created_at:
                newAgent.created_at,
            },
          },
          200,
        );
      } catch (error) {
        console.error(
          "CREATE AGENT UNEXPECTED ERROR:",
          error,
        );

        return jsonResponse(
          {
            success: false,

            message:
              error instanceof Error
                ? error.message
                : "Unexpected server error.",
          },
          500,
        );
      }
    },
  ),
};