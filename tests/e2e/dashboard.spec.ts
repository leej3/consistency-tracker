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
  await expect(page.getByTestId("status-auth")).toHaveAttribute(
    "title",
    /Green = connected\/healthy/i,
  );
  await expect(page.getByTestId("status-database")).toBeVisible();
  await expect(page.getByTestId("status-database")).toHaveAttribute(
    "title",
    /Green = connected\/healthy, gray = checking or idle, red = error/i,
  );
  await expect(page.getByTestId("status-people-query")).toBeVisible();
  await expect(page.getByTestId("status-people-query")).toHaveAttribute(
    "title",
    /Green = connected\/healthy, gray = checking or idle, red = error/i,
  );
  await expect(page.getByTestId("status-entries-query")).toBeVisible();
  await expect(page.getByTestId("status-entries-query")).toHaveAttribute(
    "title",
    /Green = connected\/healthy, gray = checking or idle, red = error/i,
  );
  await expect(page.getByTestId("status-refresh")).toHaveAttribute(
    "title",
    /Green pulse = refresh cycle completed/i,
  );

  await page.getByRole("button", { name: "open settings" }).click();
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("quick-add time control is constrained and Bristol help tooltip is present", async ({
  page,
}) => {
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

  await expect(quickAdd.getByRole("button", { name: "Show stool chart help" })).toHaveAttribute(
    "title",
    /Bristol Stool Chart[\s\S]*4: Smooth, soft sausage or snake/i,
  );
});

test("can add, then edit, an entry in the entries list", async ({ page }) => {
  const personId = randomUUID();
  const entryComment = `playwright-entry-initial-${Date.now()}`;
  const updatedComment = `playwright-entry-updated-${Date.now()}`;
  const todayUtc = new Date().toISOString().slice(0, 10);

  await login(page);
  await addPerson(page, personId);

  const quickAdd = page.locator("section.card", {
    has: page.getByRole("heading", { name: "Quick add (home person)" }),
  });

  await quickAdd.getByLabel("Entry date (UTC)").fill(todayUtc);
  await quickAdd.getByLabel("Entry hour (UTC)").selectOption("13:00");
  await quickAdd.getByLabel("Bristol score").selectOption("4");
  await quickAdd.locator("textarea").fill(entryComment);
  await quickAdd.getByRole("button", { name: "Save entry" }).click();

  await expect(page.getByText("Entry added.")).toBeVisible();

  const entriesSection = page.locator("section.card", {
    has: page.getByRole("heading", { name: /Entries for/ }),
  });
  await expect(entriesSection).toContainText(entryComment);

  await entriesSection.getByRole("button", { name: "Edit" }).first().click();
  await entriesSection.getByLabel("Edit entry hour (UTC)").selectOption("14:00");
  await entriesSection.getByLabel("Edit Bristol score").selectOption("5");
  await entriesSection.getByLabel("Edit comment").fill(updatedComment);
  await entriesSection.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByText("Entry updated.")).toBeVisible();
  await expect(entriesSection).toContainText(updatedComment);
});
