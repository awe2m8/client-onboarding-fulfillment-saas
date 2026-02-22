import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const pages = [
  { name: "Launcher", path: "/", shell: ".launcher-shell" },
  { name: "Onboarding", path: "/onboarding.html", shell: ".app-shell" },
  { name: "Project Management", path: "/project-management.html", shell: ".pm-shell" },
  { name: "Sprints", path: "/sprints.html", shell: ".sp-shell" },
  { name: "Realtime Sync", path: "/realtime-sync.html", shell: ".rt-shell" }
];

function formatViolations(violations) {
  if (!violations.length) {
    return "No serious/critical violations found.";
  }

  return violations
    .map((violation) => {
      const nodes = (violation.nodes || [])
        .slice(0, 5)
        .map((node) => `    - ${node.target.join(", ")}: ${node.failureSummary || "No summary"}`)
        .join("\n");
      return `${violation.id} (${violation.impact})\n  ${violation.help}\n${nodes}`;
    })
    .join("\n\n");
}

for (const pageConfig of pages) {
  test(`${pageConfig.name}: shell renders`, async ({ page }) => {
    await page.goto(pageConfig.path, { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator(pageConfig.shell)).toBeVisible();
  });

  test(`${pageConfig.name}: keyboard focus reaches interactive control`, async ({ page }) => {
    await page.goto(pageConfig.path, { waitUntil: "domcontentloaded" });
    await page.keyboard.press("Tab");

    const activeTag = await page.evaluate(() => {
      return document.activeElement ? document.activeElement.tagName : "";
    });

    expect(activeTag).not.toBe("BODY");
  });

  test(`${pageConfig.name}: no critical/serious axe violations`, async ({ page }) => {
    await page.goto(pageConfig.path, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    const blocking = results.violations.filter((violation) =>
      ["critical", "serious"].includes(String(violation.impact || ""))
    );

    expect(blocking, formatViolations(blocking)).toEqual([]);
  });
}
