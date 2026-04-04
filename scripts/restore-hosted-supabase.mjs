#!/usr/bin/env node

const SUPABASE_API_BASE_URL = "https://api.supabase.com";

function deriveProjectRef(rawUrl) {
  if (!rawUrl) {
    return "";
  }

  const withoutProtocol = rawUrl.trim().replace(/^https?:\/\//i, "");
  const host = withoutProtocol.split("/")[0];
  return host.split(".")[0] || "";
}

async function supabaseRequest(path, { method = "GET" } = {}) {
  const response = await fetch(`${SUPABASE_API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
      Accept: "application/json",
    },
  });

  const body = await response.text();

  if (!response.ok) {
    const detail = body.trim() || response.statusText;
    throw new Error(
      `Supabase API request to ${path} failed with HTTP ${response.status}: ${detail}`,
    );
  }

  return body ? JSON.parse(body) : null;
}

async function main() {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("SUPABASE_ACCESS_TOKEN is required.");
  }

  const explicitProjectRef = process.env.SUPABASE_PROJECT_REF;
  const derivedProjectRef = deriveProjectRef(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  );
  const projectRef = explicitProjectRef || derivedProjectRef;

  if (!projectRef) {
    throw new Error(
      "Set SUPABASE_PROJECT_REF or VITE_SUPABASE_URL/SUPABASE_URL so the project ref can be derived.",
    );
  }

  const project = await supabaseRequest(`/v1/projects/${projectRef}`);

  if (project?.status !== "INACTIVE") {
    console.log(
      `Supabase project ${projectRef} is ${project?.status ?? "unknown"}; no restore needed.`,
    );
    return;
  }

  await supabaseRequest(`/v1/projects/${projectRef}/restore`, { method: "POST" });
  console.log(`Restored Supabase project ${projectRef}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
