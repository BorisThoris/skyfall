/**
 * Skyfall bootstrap. Editor: `EditorScene` and `#/editor` routing exist only when
 * `import.meta.env.DEV` (Vite dev server). `npm run build` / Electron prod use shipping scenes only.
 */
import Phaser from "phaser";
import phaserJuicePlugin from "phaser3-juice-plugin";
import LoadingScene from "./scenes/loadingScene";
import MainMenuScene from "./scenes/mainMenuScene";
import OptionsScene from "./scenes/optionsScene";
import CreditsScene from "./scenes/creditsScene";
import AboutScene from "./scenes/aboutScene";
import AchievementsScene from "./scenes/achievementsScene";
import DodgeGame from "./scenes/dodgeGame";
import MetaScene from "./scenes/metaScene";
import TutorialScene from "./scenes/tutorialScene";
import EditorScene from "./scenes/editorScene";
import { SCENE_KEYS } from "./config/sceneKeys";
import { initMobileControls, isMobile } from "./input/mobileControls";
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  theme
} from "./config/gameConfig";
import { GAME_VERSION } from "./config/version";
import { getSettings } from "./save/saveManager.js";
import { setTelemetryConsentChecker, setTelemetryUploadHook } from "./game/telemetry.js";

const config = {
  type: Phaser.AUTO,
  parent: "phaser-example",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: theme.colors.semantic.background.overlay,
  fps: {
    limit: 60,
    min: 30
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { y: 700 },
      debug: false
    }
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  plugins: {
    scene: [
      { key: "phaserJuice", plugin: phaserJuicePlugin, mapping: "juice" }
    ]
  },
  scene: [
    LoadingScene,
    MainMenuScene,
    OptionsScene,
    AchievementsScene,
    TutorialScene,
    CreditsScene,
    AboutScene,
    DodgeGame,
    MetaScene,
    ...(import.meta.env.DEV ? [EditorScene] : [])
  ]
};

const game = new Phaser.Game(config);
if (import.meta.env.DEV) {
  const transitionLog = [];
  const getActiveSceneKeys = () =>
    (game.scene?.scenes || [])
      .filter((scene) => game.scene.isActive(scene.sys.settings.key))
      .map((scene) => scene.sys.settings.key);
  const getCurrentSceneKey = () => getActiveSceneKeys().at(-1) || null;
  const originalSceneStart = game.scene.start.bind(game.scene);
  game.scene.start = (sceneKey, ...args) => {
    transitionLog.push({
      from: getCurrentSceneKey(),
      to: sceneKey,
      at: Date.now()
    });
    if (transitionLog.length > 12) {
      transitionLog.shift();
    }
    return originalSceneStart(sceneKey, ...args);
  };
  const getSceneSnapshot = () => {
    const currentSceneKey = getCurrentSceneKey();
    const menuScene = game.scene.getScene(SCENE_KEYS.mainMenu);
    const gameScene = game.scene.getScene(SCENE_KEYS.game);
    const settings = getSettings();
    return {
      version: GAME_VERSION,
      currentSceneKey,
      activeSceneKeys: getActiveSceneKeys(),
      editorAvailable: Boolean(game.scene.getScene(SCENE_KEYS.editor)),
      selectedMode: gameScene?.mode || menuScene?.selectedMode || null,
      selectedArchetypeId: gameScene?.selectedArchetypeId || menuScene?.selectedArchetypeId || null,
      options: {
        musicVolume: settings.musicVolume,
        sfxVolume: settings.sfxVolume,
        screenShakeIntensity: settings.screenShakeIntensity,
        flashIntensity: settings.flashIntensity,
        colorBlindPaletteMode: settings.colorBlindPaletteMode,
        reduceMotionSafeMode: settings.reduceMotionSafeMode,
        allowAnonymousAnalytics: settings.allowAnonymousAnalytics
      },
      run: {
        score: gameScene?.getScore ? gameScene.getScore() : 0,
        runTimeMs: gameScene?.runTimeMs || 0,
        gameOverState: gameScene?.gameOverState ?? false,
        gameOverVisible: Boolean(gameScene?.gameOverPanel?.visible && gameScene?.gameOverText?.visible),
        replayVisible: Boolean(gameScene?.replayButton?.visible || gameScene?.playAgainText?.visible),
        paused: Boolean(gameScene?.paused),
        challengeVisible: Boolean(gameScene?.activeChallenge),
        perkDraftVisible: Boolean(gameScene?.pendingPerkChoices)
      },
      lastTransition: transitionLog.at(-1) || null
    };
  };
  window.__skyfallDev = {
    game,
    GAME_VERSION,
    getState: getSceneSnapshot
  };
}
initMobileControls();
if (!isMobile()) document.body.classList.add("desktop-build");

setTelemetryConsentChecker(() => Boolean(getSettings().allowAnonymousAnalytics));

const telemetryEndpoint =
  typeof import.meta.env !== "undefined" ? import.meta.env.VITE_TELEMETRY_ENDPOINT : "";
if (telemetryEndpoint && typeof telemetryEndpoint === "string") {
  setTelemetryUploadHook(async events => {
    const res = await fetch(telemetryEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events, gameVersion: GAME_VERSION })
    });
    if (!res.ok) {
      throw new Error(`telemetry upload failed: ${res.status}`);
    }
  });
}

if (import.meta.env.DEV) {
  window.addEventListener("hashchange", () => {
    if (window.location.hash === "#/editor" && game.scene.getScene(SCENE_KEYS.editor)) {
      game.scene.start(SCENE_KEYS.editor);
    }
  });
}
