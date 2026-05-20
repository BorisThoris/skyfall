// @ts-check
import { test, expect } from "@playwright/test";

const GAME_CANVAS = "#phaser-example canvas";

async function skipTutorialOnBoot(page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "skyfall_save",
      JSON.stringify({ version: 2, tutorialCompleted: true, tutorialOptOut: false })
    );
  });
}

async function expectSceneActive(page, sceneKey) {
  await page.waitForFunction(() => Boolean(window.__skyfallDev?.getState));
  await page.waitForFunction(
    (key) => window.__skyfallDev?.getState?.().currentSceneKey === key,
    sceneKey
  );
  await expect.poll(
    async () => page.evaluate(() => window.__skyfallDev.getState().currentSceneKey)
  ).toBe(sceneKey);
}

test.describe("Game scene", () => {
  test.beforeEach(async ({ page }) => {
    await skipTutorialOnBoot(page);
    await page.goto("/");
    await expectSceneActive(page, "mainMenuScene");
    await page.keyboard.press("Space");
    await expect(page.locator(GAME_CANVAS)).toBeVisible({ timeout: 10000 });
    await expectSceneActive(page, "gameScene");
  });

  test("game scene shows canvas after start", async ({ page }) => {
    const canvas = page.locator(GAME_CANVAS);
    await expect(canvas).toBeVisible();
    await expectSceneActive(page, "gameScene");
    await expect.poll(async () =>
      page.evaluate(() => window.__skyfallDev.getState().selectedMode)
    ).toBe("Classic");
  });

  test("short gameplay with arrow key keeps canvas visible and does not crash", async ({ page }) => {
    await page.keyboard.down("ArrowRight");
    await page.keyboard.up("ArrowRight");
    const canvas = page.locator(GAME_CANVAS);
    await expect(canvas).toBeVisible({ timeout: 5000 });
    await expectSceneActive(page, "gameScene");
    await expect.poll(async () =>
      page.evaluate(() => window.__skyfallDev.getState().run.gameOverState)
    ).toBe(false);
  });
});

test.describe("Game start", () => {
  test("no console errors during game start", async ({ page }) => {
    await skipTutorialOnBoot(page);
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    await page.goto("/");
    await expectSceneActive(page, "mainMenuScene");
    await page.keyboard.press("Space");
    await expect(page.locator(GAME_CANVAS)).toBeVisible({ timeout: 5000 });
    await expectSceneActive(page, "gameScene");
    expect(consoleErrors, `Unexpected console.error(s): ${consoleErrors.join("; ")}`).toHaveLength(0);
  });
});
