import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const ADMIN_EMAIL = "johnlee3@gmail.com";
const ADMIN_PASSWORD = process.env.SUPABASE_LOCAL_USER_PASSWORD || "localdevpassword123";

const shortPersonLabel = (personId: string) => `${personId.slice(0, 8)}...${personId.slice(-4)}`;

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(new RegExp(`Signed in as ${ADMIN_EMAIL}`, "i"))).toBeVisible();
}

async function addPerson(page: Page, personId: string) {
  const personSetup = page.locator("section.card", {
    has: page.getByRole("heading", { name: "Person setup" }),
  });

  await personSetup.getByPlaceholder("Person UUID (leave blank for auto-generated)").fill(personId);
  await personSetup.getByLabel("Set as default home person").check();
  await personSetup.getByRole("button", { name: "Add person" }).click();

  await expect(page.getByText("Person added.")).toBeVisible();
  await expect(page.getByText(`Default person: ${shortPersonLabel(personId)}`)).toBeVisible();

  const insights = page.locator("section.card", {
    has: page.getByRole("heading", { name: "Insights" }),
  });
  await insights.locator("select").first().selectOption(personId);
}

test("shows backend status icons in the header and supports settings sign out", async ({
  page,
}) => {
  await login(page);

  await expect(page.getByTestId("status-auth")).toBeVisible();
  await expect(page.getByTestId("status-database")).toBeVisible();
  await expect(page.getByTestId("status-people-query")).toBeVisible();
  await expect(page.getByTestId("status-entries-query")).toBeVisible();
  await expect(page.getByTestId("status-refresh")).toHaveAttribute("title", /Auto refresh/i);

  await page.getByRole("button", { name: "open settings" }).click();
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("quick-add time control is constrained to whole-hour values", async ({ page }) => {
  await login(page);
  await addPerson(page, randomUUID());

  const quickAdd = page.locator("section.card", {
    has: page.getByRole("heading", { name: "Quick add (home person)" }),
  });
  const hourSelect = quickAdd.locator("form select").first();

  const hourOptions = await hourSelect.locator("option").allTextContents();
  expect(hourOptions).toHaveLength(24);
  for (const option of hourOptions) {
    expect(option).toMatch(/^\d{2}:00$/);
  }
});

test("can add a person and save an entry that appears in the entries list", async ({ page }) => {
  const personId = randomUUID();
  const entryComment = `playwright-entry-${Date.now()}`;
  const todayUtc = new Date().toISOString().slice(0, 10);

  await login(page);
  await addPerson(page, personId);

  const quickAdd = page.locator("section.card", {
    has: page.getByRole("heading", { name: "Quick add (home person)" }),
  });

  await quickAdd.locator("input[type='date']").fill(todayUtc);
  await quickAdd.locator("form select").nth(0).selectOption("13:00");
  await quickAdd.locator("form select").nth(1).selectOption("4");
  await quickAdd.locator("textarea").fill(entryComment);
  await quickAdd.getByRole("button", { name: "Save entry" }).click();

  await expect(page.getByText("Entry added.")).toBeVisible();

  const entriesSection = page.locator("section.card", {
    has: page.getByRole("heading", { name: /Entries for/ }),
  });
  await expect(entriesSection).toContainText(entryComment);
});
