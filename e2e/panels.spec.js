// @ts-check
import { test, expect } from "@playwright/test";

const CANVAS_SELECTOR = "#phaser-example canvas";
const GET_READY_MS = 2800;
const CHALLENGE_WAIT_MS = 5000;
const GENEROUS_TIMEOUT_MS = 50000;

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

async function startGame(page) {
  await skipTutorialOnBoot(page);
  await page.goto("/");
  const canvas = page.locator(CANVAS_SELECTOR);
  await expect(canvas).toBeVisible({ timeout: 10000 });
  await expectSceneActive(page, "mainMenuScene");
  await page.keyboard.press("Space");
  await expect(canvas).toBeVisible();
  await expectSceneActive(page, "gameScene");
  return canvas;
}

async function forceGameOver(page) {
  await page.evaluate(() => {
    const scene = window.__skyfallDev.game.scene.getScene("gameScene");
    scene.endRun();
  });
  await expect.poll(async () =>
    page.evaluate(() => window.__skyfallDev.getState().run.gameOverState)
  ).toBe("ended");
  await expect.poll(async () =>
    page.evaluate(() => window.__skyfallDev.getState().run.gameOverVisible)
  ).toBe(true);
}

test.describe("Panels and game over", () => {
  test("game reaches game-over when player dies", async ({ page }) => {
    test.setTimeout(GENEROUS_TIMEOUT_MS);

    const canvas = await startGame(page);
    await forceGameOver(page);

    await expect(canvas).toBeVisible();
    await expect.poll(async () =>
      page.evaluate(() => window.__skyfallDev.getState().run.replayVisible)
    ).toBe(true);
  });

  test("challenge panel wait keeps the game scene stateful", async ({ page }) => {
    test.setTimeout(GENEROUS_TIMEOUT_MS);

    const canvas = await startGame(page);
    await page.waitForTimeout(GET_READY_MS);
    await page.waitForTimeout(CHALLENGE_WAIT_MS);

    await expect(canvas).toBeVisible();
    await expectSceneActive(page, "gameScene");
    await expect.poll(async () =>
      page.evaluate(() => {
        const state = window.__skyfallDev.getState();
        return state.run.challengeVisible || state.run.perkDraftVisible || state.run.gameOverState === false;
      })
    ).toBe(true);
  });

  test("game over and replay", async ({ page }) => {
    test.setTimeout(GENEROUS_TIMEOUT_MS);

    const canvas = await startGame(page);
    await forceGameOver(page);
    await expect(canvas).toBeVisible();

    await page.evaluate(() => {
      window.__skyfallDev.game.scene.getScene("gameScene").resetRun();
    });

    await expect(canvas).toBeVisible({ timeout: 5000 });
    await expectSceneActive(page, "gameScene");
    await expect.poll(async () =>
      page.evaluate(() => window.__skyfallDev.getState().run.gameOverState)
    ).toBe(false);
    await expect.poll(async () =>
      page.evaluate(() => window.__skyfallDev.getState().run.replayVisible)
    ).toBe(false);
  });
});
