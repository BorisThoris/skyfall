// @ts-check
import { test, expect } from "@playwright/test";

/** Minimal save so main menu does not show the tutorial modal (would steal clicks). */
function seedSaveNoTutorialPrompt() {
  const minimal = {
    version: 2,
    highScore: 0,
    highScoresByMode: { Classic: 0, BossRush: 0, Draft: 0 },
    lastCompletedLevel: 0,
    selectedArchetype: "all-rounder",
    settings: {
      musicVolume: 1,
      sfxVolume: 1,
      fullscreen: false,
      resolutionOrQuality: "1280x720",
      screenShakeIntensity: 1,
      flashIntensity: 1,
      colorBlindPaletteMode: "off",
      themeId: "skyfall",
      allowAnonymousAnalytics: false,
      reduceMotionSafeMode: false
    },
    bestTimesByMode: { Classic: 0, BossRush: 0, Draft: 0 },
    lifetimeMetaEarned: 0,
    unlockedAchievements: [],
    metaFragments: 0,
    metaCurrency: 0,
    tutorialCompleted: false,
    tutorialOptOut: true,
    unlockTree: { unlockedNodes: [] },
    contracts: {
      seedDate: "",
      expiresAt: "",
      difficultyKey: "",
      active: [],
      claimed: {},
    },
  };
  localStorage.setItem("skyfall_save", JSON.stringify(minimal));
}

const PAGE_LOAD_TIMEOUT = 15000;
const CANVAS_SELECTOR = "#phaser-example canvas";
test.describe("Options — version string (AGENT-37 / AGENT-50)", () => {
  test.setTimeout(45000);

  test("Options scene lists Skyfall version matching GAME_VERSION", async ({ page }) => {
    await page.addInitScript(seedSaveNoTutorialPrompt);
    await page.goto("/");
    const canvas = page.locator(CANVAS_SELECTOR);
    await expect(canvas).toBeVisible({ timeout: PAGE_LOAD_TIMEOUT });

    await page.waitForFunction(
      () => {
        return window.__skyfallDev?.getState?.().currentSceneKey === "mainMenuScene";
      },
      { timeout: PAGE_LOAD_TIMEOUT }
    );

    await page.evaluate(() => {
      window.__skyfallDev?.startScene?.("optionsScene", { returnTo: "mainMenuScene" });
    });
    await page.waitForFunction(
      () => {
        return window.__skyfallDev?.getState?.().currentSceneKey === "optionsScene";
      },
      { timeout: 20000 }
    );

    const result = await page.evaluate(() => {
      const dev = window.__skyfallDev;
      if (!dev?.getState || !dev?.getSceneTexts) {
        return { ok: false, reason: "DEV hook missing (expected under Vite dev)" };
      }
      if (dev.getState().currentSceneKey !== "optionsScene") {
        return { ok: false, reason: "optionsScene not active" };
      }
      const texts = dev.getSceneTexts("optionsScene");
      const versionLine = texts.find((t) => /^Skyfall v/.test(t));
      const expected = `Skyfall v${dev.GAME_VERSION}`;
      return {
        ok: versionLine === expected,
        versionLine,
        expected,
        samples: texts.slice(0, 8),
      };
    });

    expect(result.ok, JSON.stringify(result)).toBe(true);
  });
});
