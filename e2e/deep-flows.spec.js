// @ts-check
/**
 * Deeper flows (AGENT-36). Mitigations: long timeouts for death, DEV-only hooks
 * (`window.__skyfallDev`) for scene/state assertions; Phaser has no DOM nodes for menu text.
 */
import { test, expect } from "@playwright/test";

const CANVAS = "#phaser-example canvas";
const PAGE_LOAD_TIMEOUT = 15000;

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

test.describe("Deep flows", () => {
  // Game-over + replay is covered in panels.spec.js (deterministic wait). This file adds storage + scene hooks.

  test("save settings survive reload (storage path)", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(CANVAS)).toBeVisible({ timeout: PAGE_LOAD_TIMEOUT });
    await page.evaluate(() => {
      const key = "skyfall_save";
      const raw = localStorage.getItem(key);
      const data = raw ? JSON.parse(raw) : { version: 2, settings: {} };
      data.settings = { ...data.settings, musicVolume: 0.37 };
      localStorage.setItem(key, JSON.stringify(data));
    });
    await page.reload({ waitUntil: "load" });
    await expect(page.locator(CANVAS)).toBeVisible({ timeout: PAGE_LOAD_TIMEOUT });
    const vol = await page.evaluate(() => {
      const raw = localStorage.getItem("skyfall_save");
      if (!raw) return null;
      return JSON.parse(raw).settings?.musicVolume ?? null;
    });
    expect(vol).toBe(0.37);
  });

  test("achievements scene boots from DEV scene switch", async ({ page }) => {
    test.setTimeout(25000);
    await page.goto("/");
    await expect(page.locator(CANVAS)).toBeVisible({ timeout: PAGE_LOAD_TIMEOUT });
    await waitForDevGame(page);
    await page.evaluate(() => {
      window.__skyfallDev.game.scene.start("achievementsScene", {
        returnTo: "mainMenuScene"
      });
    });
    await expectSceneActive(page, "achievementsScene");
  });

  test("fresh first-run menu prompt and tutorial can be completed with keyboard only", async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem("skyfall_save"));
    await page.goto("/");
    await expect(page.locator(CANVAS)).toBeVisible({ timeout: PAGE_LOAD_TIMEOUT });
    await expectSceneActive(page, "mainMenuScene");

    const promptVisible = await page.evaluate(() => {
      const menu = window.__skyfallDev?.game?.scene?.getScene("mainMenuScene");
      return Array.isArray(menu?._tutorialPromptObjects) && menu._tutorialPromptObjects.length > 0;
    });
    expect(promptVisible).toBe(true);

    await page.keyboard.press("Space");
    await expectSceneActive(page, "tutorialScene");

    await page.keyboard.press("Space");
    await expectSceneActive(page, "gameScene");
  });
});
