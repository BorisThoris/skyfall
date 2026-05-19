// @ts-check
import { test, expect } from "@playwright/test";

const PAGE_LOAD_TIMEOUT = 15000;
const CANVAS_SELECTOR = "#phaser-example canvas";
const PHASER_CONTAINER = "#phaser-example";

async function waitForDevGame(page) {
  await page.waitForFunction(() => Boolean(window.__skyfallDev?.game));
}

async function expectSceneActive(page, sceneKey) {
  await waitForDevGame(page);
  await page.waitForFunction(
    (key) => window.__skyfallDev?.game?.scene?.isActive(key) === true,
    sceneKey
  );
}

async function skipTutorialOnBoot(page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "skyfall_save",
      JSON.stringify({ version: 2, tutorialCompleted: true, tutorialOptOut: false })
    );
  });
}

test.describe("Boot and menu", () => {
  test.setTimeout(25000);

  test("page loads with title and game canvas", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Skyfall/i, { timeout: PAGE_LOAD_TIMEOUT });
    const canvas = page.locator(CANVAS_SELECTOR);
    await expect(canvas).toBeVisible({ timeout: PAGE_LOAD_TIMEOUT });
  });

  test("page has header text", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".page-header h1")).toContainText("Skyfall", {
      timeout: PAGE_LOAD_TIMEOUT,
    });
  });

  test("no console errors on page load", async ({ page }) => {
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push({ type: msg.type(), text: msg.text() });
      }
    });
    await page.goto("/");
    const canvas = page.locator(CANVAS_SELECTOR);
    await expect(canvas).toBeVisible({ timeout: PAGE_LOAD_TIMEOUT });
    expect(
      consoleErrors,
      `Console errors on load: ${JSON.stringify(consoleErrors)}`
    ).toHaveLength(0);
  });

  test("starting game via Space switches to game scene", async ({ page }) => {
    await skipTutorialOnBoot(page);
    await page.goto("/");
    const canvas = page.locator(CANVAS_SELECTOR);
    await expect(canvas).toBeVisible({ timeout: PAGE_LOAD_TIMEOUT });
    await expectSceneActive(page, "mainMenuScene");
    await page.keyboard.press("Space");
    await expect(canvas).toBeVisible();
    await expectSceneActive(page, "gameScene");
  });

  test("starting game via Enter switches to game scene", async ({ page }) => {
    await skipTutorialOnBoot(page);
    await page.goto("/");
    const canvas = page.locator(CANVAS_SELECTOR);
    await expect(canvas).toBeVisible({ timeout: PAGE_LOAD_TIMEOUT });
    await expectSceneActive(page, "mainMenuScene");
    await page.keyboard.press("Enter");
    await expect(canvas).toBeVisible();
    await expectSceneActive(page, "gameScene");
  });

  test("fresh first-run flow reaches gameplay using keyboard only", async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem("skyfall_save"));
    await page.goto("/");
    await expect(page.locator(CANVAS_SELECTOR)).toBeVisible({ timeout: PAGE_LOAD_TIMEOUT });
    await expectSceneActive(page, "mainMenuScene");

    await page.keyboard.press("Space");
    await expectSceneActive(page, "tutorialScene");

    await page.keyboard.press("Enter");
    await expectSceneActive(page, "gameScene");
  });

  test("starting game via click keeps canvas visible and produces no console errors", async ({
    page,
  }) => {
    await skipTutorialOnBoot(page);
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push({ type: msg.type(), text: msg.text() });
      }
    });
    await page.goto("/");
    const container = page.locator(PHASER_CONTAINER);
    const canvas = page.locator(CANVAS_SELECTOR);
    await expect(canvas).toBeVisible({ timeout: PAGE_LOAD_TIMEOUT });
    await expectSceneActive(page, "mainMenuScene");
    consoleErrors.length = 0;
    const box = await container.boundingBox();
    expect(box).toBeTruthy();
    const gameW = 1280;
    const gameH = 720;
    // Left panel "Play" row (see mainMenuScene menuYStart + first item)
    const playX = 96;
    const playY = 284;
    const clickX = box.x + (box.width * playX) / gameW;
    const clickY = box.y + (box.height * playY) / gameH;
    await page.mouse.click(clickX, clickY);
    await expect(canvas).toBeVisible();
    expect(
      consoleErrors,
      `Console errors after start: ${JSON.stringify(consoleErrors)}`
    ).toHaveLength(0);
  });

  test("app is running at #/editor: canvas visible and no console errors", async ({
    page,
  }) => {
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push({ type: msg.type(), text: msg.text() });
      }
    });
    await page.goto("/#/editor");
    const canvas = page.locator(CANVAS_SELECTOR);
    await expect(canvas).toBeVisible({ timeout: PAGE_LOAD_TIMEOUT });
    expect(page.url()).toContain("#/editor");
    expect(
      consoleErrors,
      `Console errors on #/editor: ${JSON.stringify(consoleErrors)}`
    ).toHaveLength(0);
  });

  test("achievements screen opens from menu and Back returns without errors", async ({
    page,
  }) => {
    await skipTutorialOnBoot(page);
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push({ type: msg.type(), text: msg.text() });
      }
    });
    await page.goto("/");
    const canvas = page.locator(CANVAS_SELECTOR);
    await expect(canvas).toBeVisible({ timeout: PAGE_LOAD_TIMEOUT });
    await expectSceneActive(page, "mainMenuScene");
    consoleErrors.length = 0;

    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    const gameW = 1280;
    const gameH = 720;
    const achievementsItemX = 100;
    const achievementsItemY = 380;
    const clickAchievementsX = box.x + (box.width * achievementsItemX) / gameW;
    const clickAchievementsY = box.y + (box.height * achievementsItemY) / gameH;
    await page.mouse.click(clickAchievementsX, clickAchievementsY);
    await page.waitForTimeout(400);
    await expect(canvas).toBeVisible();
    expect(
      consoleErrors,
      `Console errors after opening Achievements: ${JSON.stringify(consoleErrors)}`
    ).toHaveLength(0);

    const backX = box.x + (box.width * 640) / gameW;
    const backY = box.y + (box.height * 620) / gameH;
    await page.mouse.click(backX, backY);
    await page.waitForTimeout(300);
    await expect(canvas).toBeVisible();
    expect(
      consoleErrors,
      `Console errors after Back: ${JSON.stringify(consoleErrors)}`
    ).toHaveLength(0);
  });
});
