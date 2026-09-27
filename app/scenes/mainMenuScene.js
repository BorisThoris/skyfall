import createMainMenuView from "../ui/mainMenuView";
import { GAME_CENTER_X, GAME_CENTER_Y, GAME_HEIGHT, GAME_WIDTH, PLAYER_START_Y, theme } from "../config/gameConfig";
import { SCENE_KEYS } from "../config/sceneKeys";
import { EXIT_UNLOCK_SCORE } from "../game/runnerContent";
import { ensureProceduralTexture, DEFAULT_PROCEDURAL_PARAMS } from "../game/proceduralSprites";
import { ARCHETYPE_LIBRARY } from "../game/archetypeSystem";
import {
  getOnlineStatus,
  listAchievementStates,
  setRichPresence
} from "../services/onlineService";
import {
  getSelectedArchetype,
  getSettings,
  initSaveFromCloud,
  setSelectedArchetype,
  getActiveContracts,
  getMetaProgression,
  claimCompletedContract,
  shouldShowTutorial,
  setTutorialOptOut
} from "../save/saveManager";
import { GAME_VERSION } from "../config/version";
import BaseScene from "./baseScene";
import { getModeList, normalizeGameMode } from "../game/modeConfig";
import { getDailyModifierProfile } from "../game/dailyModifier.js";
import { BODY_STYLE, PANEL_TITLE_STYLE } from "../config/sceneStyles";

/** Valve/GMod-style main menu: options panel on the left, visuals (player + bg) on the right. */
const PANEL_WIDTH = 380;
const PANEL_PADDING = theme.spacing[8];
const SUMMARY_X = PANEL_WIDTH + theme.spacing[16];
const SUMMARY_WIDTH = theme.spacing[64] + theme.spacing[32];
const PANEL_ALPHA = 0.94;
const MENU_PLAYER_X = GAME_WIDTH - 200;
const MENU_PLAYER_Y = PLAYER_START_Y - 50;
const MENU_PLAYER_SCALE = 1.4;

export default class MainMenuScene extends BaseScene {
  constructor() {
    super(SCENE_KEYS.mainMenu);
    this.selectedMode = "Classic";
  }

  init(data) {
    this._menuData = data || {};
    this.selectedMode = normalizeGameMode(this._menuData.mode || this.selectedMode);
  }

  create() {
    initSaveFromCloud();
    super.createSceneShell(MENU_PLAYER_X, "flex", false);
    this.input.keyboard.resetKeys();
    setRichPresence("In menu");
    if (getSettings().fullscreen && this.scale && this.scale.startFullscreen) {
      this.scale.startFullscreen();
    }

    this._ensureMenuProceduralTextures();
    this._addProceduralEnemies();
    this._poseAndSizePlayer();
    this.selectedArchetypeId = getSelectedArchetype();

    const contracts = getActiveContracts();
    const contractClaims = [];
    contracts.forEach((contract) => {
      const reward = claimCompletedContract(contract.id);
      if (reward) {
        contractClaims.push({ title: contract.title, reward });
      }
    });
    const refreshedMeta = getMetaProgression();

    this.menuView = createMainMenuView(this, {
      contracts: getActiveContracts(), meta: refreshedMeta,
      daily: getDailyModifierProfile().menuLine,
      achievements: listAchievementStates().filter(item => item.unlocked).length
    });

    if (shouldShowTutorial()) {
      this._showTutorialPrompt();
      this.menuView.element.hidden = true;
    }

    this._keyboardStartHandler = (event) => {
      if (this.menuView.element.contains(event.target) && /BUTTON|SELECT/.test(event.target.tagName)) return;
      this._handleKeyboardStart();
    };
    this._keyboardSkipHandler = () => {
      if (this._tutorialPromptObjects) {
        this._skipTutorialPrompt();
      }
    };
    this.input.keyboard.on("keydown-SPACE", this._keyboardStartHandler);
    this.input.keyboard.on("keydown-ENTER", this._keyboardStartHandler);
    this.input.keyboard.on("keydown-ESC", this._keyboardSkipHandler);
    this.events.once("shutdown", () => {
      this.input.keyboard.off("keydown-SPACE", this._keyboardStartHandler);
      this.input.keyboard.off("keydown-ENTER", this._keyboardStartHandler);
      this.input.keyboard.off("keydown-ESC", this._keyboardSkipHandler);
      this._keyboardStartHandler = null;
      this._keyboardSkipHandler = null;
    });
  }

  _getSelectedRunData() {
    return {
      mode: this.selectedMode,
      archetypeId: this.selectedArchetypeId
    };
  }

  _startSelectedRun(extraData = {}) {
    this.scene.start(SCENE_KEYS.game, {
      ...this._getSelectedRunData(),
      ...extraData
    });
  }

  _acceptTutorialPrompt() {
    this._destroyTutorialPrompt();
    this.scene.start(SCENE_KEYS.tutorial, {
      returnTo: SCENE_KEYS.game,
      returnData: {
        ...this._getSelectedRunData(),
        skipTutorialGate: true
      }
    });
  }

  _skipTutorialPrompt() {
    setTutorialOptOut(true);
    this._destroyTutorialPrompt();
    this._startSelectedRun({ skipTutorialGate: true });
  }

  _handleKeyboardStart() {
    if (this._tutorialPromptObjects) {
      this._acceptTutorialPrompt();
    } else {
      this._startSelectedRun();
    }
  }

  _showTutorialPrompt() {
    const { colors, zIndex } = theme;
    const modalDepth = zIndex.modal;
    const panelW = 420;
    const panelH = 180;
    const cx = GAME_CENTER_X;
    const cy = GAME_HEIGHT * 0.35;

    const backdrop = this.add.graphics();
    backdrop.fillStyle(parseInt(colors.semantic.background.overlay.replace("#", ""), 16), 0.75);
    backdrop.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    backdrop.setDepth(modalDepth);
    backdrop.setInteractive({ useHandCursor: false });

    const panel = this.add.graphics();
    panel.fillStyle(colors.semantic.game.menuPanel, PANEL_ALPHA);
    panel.fillRect(cx - panelW / 2, cy - panelH / 2, panelW, panelH);
    panel.lineStyle(theme.components.hud.stroke.width, colors.semantic.game.menuAccent, 1);
    panel.strokeRect(cx - panelW / 2, cy - panelH / 2, panelW, panelH);
    panel.setDepth(modalDepth + 1);

    const title = this.add.text(cx, cy - 58, "Quick tutorial?", {
      font: PANEL_TITLE_STYLE.font,
      fill: PANEL_TITLE_STYLE.fill,
      align: "center"
    });
    title.setOrigin(0.5, 0.5);
    title.setDepth(modalDepth + 2);

    const bodyStyle = { font: BODY_STYLE.font, fill: colors.semantic.text.muted, align: "center" };
    const hint = this.add.text(cx, cy - 14, "Enter / Space: Yes    Esc: Skip", {
      ...bodyStyle,
      font: "700 16px Arial",
      fill: colors.semantic.text.score
    });
    hint.setOrigin(0.5, 0.5);
    hint.setDepth(modalDepth + 2);

    const yesText = this.add.text(cx - 70, cy + 32, "Yes", {
      ...bodyStyle,
      font: "700 28px Arial",
      fill: colors.semantic.text.success
    });
    yesText.setOrigin(0.5, 0.5);
    yesText.setDepth(modalDepth + 2);
    yesText.setInteractive({ useHandCursor: true });
    yesText.on("pointerover", () => { yesText.setScale(1.08); });
    yesText.on("pointerout", () => { yesText.setScale(1); });
    yesText.on("pointerdown", () => this._acceptTutorialPrompt());

    const skipText = this.add.text(cx + 70, cy + 32, "Skip", {
      ...bodyStyle,
      font: "700 28px Arial",
      fill: colors.semantic.text.warm
    });
    skipText.setOrigin(0.5, 0.5);
    skipText.setDepth(modalDepth + 2);
    skipText.setInteractive({ useHandCursor: true });
    skipText.on("pointerover", () => { skipText.setScale(1.08); });
    skipText.on("pointerout", () => { skipText.setScale(1); });
    skipText.on("pointerdown", () => this._skipTutorialPrompt());

    this._tutorialPromptObjects = [backdrop, panel, title, hint, yesText, skipText];
  }

  _destroyTutorialPrompt() {
    if (this.menuView) this.menuView.element.hidden = false;
    if (!this._tutorialPromptObjects) return;
    this._tutorialPromptObjects.forEach((obj) => obj.destroy());
    this._tutorialPromptObjects = null;
  }

  _ensureMenuProceduralTextures() {
    const families = ["orb", "star", "hazardGlow", "ring", "polygon"];
    families.forEach((family, i) => {
      const params = { ...DEFAULT_PROCEDURAL_PARAMS[family], seed: i + 1 };
      ensureProceduralTexture(this, params);
    });
  }

  _addProceduralEnemies() {
    const { colors: c } = theme;
    const enemies = [
      { key: ensureProceduralTexture(this, { ...DEFAULT_PROCEDURAL_PARAMS.orb, seed: 1 }), x: 720, y: 220, scale: 0.5, tint: c.semantic.game.decorOrb, depth: theme.zIndex.gameplay - 2 },
      { key: ensureProceduralTexture(this, { ...DEFAULT_PROCEDURAL_PARAMS.star, seed: 2 }), x: 980, y: 320, scale: 0.45, tint: c.semantic.game.phaseAmber, depth: theme.zIndex.gameplay - 2 },
      { key: ensureProceduralTexture(this, { ...DEFAULT_PROCEDURAL_PARAMS.hazardGlow, seed: 1 }), x: 1120, y: 180, scale: 0.4, tint: c.semantic.game.phaseRed, depth: theme.zIndex.gameplay - 2 },
      { key: ensureProceduralTexture(this, { ...DEFAULT_PROCEDURAL_PARAMS.ring, seed: 1 }), x: 820, y: 480, scale: 0.5, tint: c.semantic.game.phaseAmber, depth: theme.zIndex.gameplay - 2 },
      { key: ensureProceduralTexture(this, { ...DEFAULT_PROCEDURAL_PARAMS.polygon, seed: 2 }), x: 1050, y: 520, scale: 0.4, tint: c.semantic.game.decorPolygon, depth: theme.zIndex.gameplay - 2 }
    ];
    enemies.forEach((e) => {
      if (!e.key) return;
      const img = this.add.image(e.x, e.y, e.key);
      img.setScale(e.scale);
      img.setTint(e.tint);
      img.setDepth(e.depth);
      img.setAlpha(0.85);
      this.tweens.add({
        targets: img,
        y: img.y + (Math.sin(Math.random() * Math.PI * 2) * 8),
        duration: 1500 + Math.random() * 500,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
      });
    });
  }

  _poseAndSizePlayer() {
    if (!this.player) return;
    this.player.setPosition(MENU_PLAYER_X, MENU_PLAYER_Y);
    this.player.setDepth(theme.zIndex.gameplay + 2);
    this.player._displayScaleMultiplier = MENU_PLAYER_SCALE;
    this.player.anims.play("jump", true);
    this.tweens.add({
      targets: this.player,
      y: MENU_PLAYER_Y - 12,
      duration: 2200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });
  }

  quit() {
    if (typeof window !== "undefined" && window.electronQuit) {
      window.electronQuit();
    } else {
      window.close();
    }
  }

}
