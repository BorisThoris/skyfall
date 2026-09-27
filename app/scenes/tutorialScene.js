import { GAME_CENTER_X, GAME_HEIGHT, GAME_WIDTH, theme } from "../config/gameConfig";
import { SCENE_KEYS } from "../config/sceneKeys";
import { BODY_STYLE, PANEL_TITLE_STYLE } from "../config/sceneStyles";
const { colors } = theme;
import { setTutorialCompleted, setTutorialOptOut } from "../save/saveManager";
import BaseScene from "./baseScene";

export default class TutorialScene extends BaseScene {
  constructor() {
    super(SCENE_KEYS.tutorial);
    this.optOut = false;
  }

  create(data) {
    super.createSceneShell(GAME_WIDTH - 140, "flex", false);
    this.input.keyboard.resetKeys();
    this.returnTo = (data && data.returnTo) || SCENE_KEYS.game;
    this.returnData = (data && data.returnData) || {};

    let y = 72;
    this.createText(GAME_CENTER_X, y, "First Run Tutorial", PANEL_TITLE_STYLE, 0.5, 0.5);
    y += 56;

    const lines = [
      "Move: WASD / Arrow Keys / Mobile joystick",
      "Avoid hazards and survive to build score.",
      "Collect pickups for shields, invulnerability, speed, and score boosts.",
      "Press 1 / 2 / 3 to answer challenge prompts and gain run rewards.",
      "When Exit unlocks, dash to the right wall to finish a run safely.",
      "Open pause with Esc and use Options to tune accessibility effects."
    ];

    lines.forEach((line) => {
      this.createText(130, y, `• ${line}`, { ...BODY_STYLE, font: "700 22px Arial", align: "left", fill: colors.semantic.text.status });
      y += 42;
    });

    y += 6;
    this.optOutLabel = this.createText(130, y, "[ ] Don't show tutorial again", {
      ...BODY_STYLE,
      font: "700 22px Arial",
      fill: colors.semantic.text.accent,
      align: "left"
    });
    this.optOutLabel.setInteractive({ useHandCursor: true });
    this.optOutLabel.on("pointerdown", () => this.toggleOptOut());

    this.spaceHint = this.createText(GAME_CENTER_X, GAME_HEIGHT - 168, "Press Enter / Space to begin • Press O to toggle opt-out", {
      ...BODY_STYLE,
      font: "700 20px Arial",
      fill: colors.semantic.text.score,
      align: "center"
    });

    const begin = this.createText(GAME_CENTER_X - 120, GAME_HEIGHT - 100, "Begin Run", {
      ...BODY_STYLE,
      font: "700 30px Arial",
      fill: colors.semantic.text.success
    });
    begin.setInteractive({ useHandCursor: true });
    begin.on("pointerdown", () => this.finishTutorial());

    const skip = this.createText(GAME_CENTER_X + 120, GAME_HEIGHT - 100, "Skip", {
      ...BODY_STYLE,
      font: "700 30px Arial",
      fill: colors.semantic.text.warm
    });
    skip.setInteractive({ useHandCursor: true });
    skip.on("pointerdown", () => this.skipTutorial());

    this._finishKeyHandler = () => this.finishTutorial();
    this._optOutKeyHandler = () => this.toggleOptOut();
    this._skipKeyHandler = () => this.skipTutorial();
    this.input.keyboard.on("keydown-ENTER", this._finishKeyHandler);
    this.input.keyboard.on("keydown-SPACE", this._finishKeyHandler);
    this.input.keyboard.on("keydown-O", this._optOutKeyHandler);
    this.input.keyboard.on("keydown-ESC", this._skipKeyHandler);
    this.events.once("shutdown", () => {
      this.input.keyboard.off("keydown-ENTER", this._finishKeyHandler);
      this.input.keyboard.off("keydown-SPACE", this._finishKeyHandler);
      this.input.keyboard.off("keydown-O", this._optOutKeyHandler);
      this.input.keyboard.off("keydown-ESC", this._skipKeyHandler);
      this._finishKeyHandler = null;
      this._optOutKeyHandler = null;
      this._skipKeyHandler = null;
    });
  }

  toggleOptOut() {
    this.optOut = !this.optOut;
    this.optOutLabel.setText(`${this.optOut ? "[x]" : "[ ]"} Don't show tutorial again`);
  }

  finishTutorial() {
    if (this.optOut) {
      setTutorialOptOut(true);
    } else {
      setTutorialCompleted(true);
    }
    this.scene.start(this.returnTo, { ...this.returnData, skipTutorialGate: true });
  }

  skipTutorial() {
    setTutorialOptOut(true);
    this.scene.start(this.returnTo, { ...this.returnData, skipTutorialGate: true });
  }

}
