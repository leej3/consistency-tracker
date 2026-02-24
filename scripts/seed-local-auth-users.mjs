import { execSync } from "node:child_process";

const DEFAULT_EMAILS = ["johnlee3@gmail.com", "emily.langhorne@gmail.com"];
const DEFAULT_PASSWORD = process.env.SUPABASE_LOCAL_USER_PASSWORD || "localdevpassword123";

function parseStatusEnv(raw) {
  const parsed = {};

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    const separator = trimmed.indexOf("=");
    if (separator < 1) {
      continue;
    }

    const key = trimmed.slice(0, separator);
    if (!/^[A-Z0-9_]+$/.test(key)) {
      continue;
    }

    let value = trimmed.slice(separator + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }

  return parsed;
}

async function createUser({ apiUrl, serviceRoleKey, email, password }) {
  const response = await fetch(`${apiUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
    }),
  });

  if (response.ok) {
    return { email, status: "created" };
  }

  const body = await response.text();
  if (response.status === 422 && /already/i.test(body)) {
    return { email, status: "exists" };
  }

  throw new Error(`failed to create ${email}: ${response.status} ${body}`);
}

async function main() {
  const statusEnv = execSync("npx --yes supabase status -o env", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const vars = parseStatusEnv(statusEnv);

  const apiUrl = vars.API_URL;
  const serviceRoleKey = vars.SERVICE_ROLE_KEY;

  if (!apiUrl || !serviceRoleKey) {
    throw new Error("local Supabase is not running. Start it with: npm run supabase:start");
  }

  if (DEFAULT_PASSWORD.length < 8) {
    throw new Error("SUPABASE_LOCAL_USER_PASSWORD must be at least 8 characters.");
  }

  for (const email of DEFAULT_EMAILS) {
    const result = await createUser({
      apiUrl,
      serviceRoleKey,
      email,
      password: DEFAULT_PASSWORD,
    });
    console.log(`${result.email}: ${result.status}`);
  }

  console.log(`done. local user password is: ${DEFAULT_PASSWORD}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
