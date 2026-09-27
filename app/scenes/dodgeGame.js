import createMobileRunHud from "../ui/mobileRunHud";
import musicBack from "../assets/backMusic(2).mp3";
import gameOver from "../assets/gameOver.mp3";
import ooGnome from "../assets/oo.mp3";
import { GAME_HEIGHT, GAME_WIDTH, theme } from "../config/gameConfig";
import { SCENE_KEYS } from "../config/sceneKeys";
import BaseScene from "./baseScene";
import RunnerSpawnDirector from "../game/runnerSpawnDirector";
import { EXIT_UNLOCK_SCORE, getCurrentLevelFromScore, OBSTACLE_LIBRARY } from "../game/runnerContent";
import ChallengeDirector from "../game/challengeDirector";
import {
  applyPerk,
  buildPerkChoices,
  createBaseModifiers,
  getPerkFeatTags,
  getPerkIconFrame,
  PERK_LIBRARY
} from "../game/perkSystem";
import { applyArchetypeToModifiers, getArchetypeById } from "../game/archetypeSystem";
import ObjectiveDirector from "../game/objectiveDirector";
import { ensureProceduralTexture, DEFAULT_PROCEDURAL_PARAMS } from "../game/proceduralSprites";
import { ensureProceduralUiAssets } from "../game/proceduralUiAssets";
import {
  impactSquash,
  cameraShake,
  cameraZoomPulse,
  emitPhaseChangeBurst,
  emitObjectiveCompleteBurst,
  emitBossTelegraph,
  playBossTelegraphSfx
} from "../game/juiceHelper";
import { showFloatingText } from "../game/floatingText";
import { DODGE_HUD_STYLES, HUD_STROKE, DODGE_AUDIO } from "../config/dodgeHudStyles";
import { applyRunEventToContracts, getContractDateKey } from "../game/contractDirector.js";
import { applyDailyModifier } from "../game/dailyModifier.js";
import { getPostRunTip } from "../config/runTips.js";
import {
  BOSS_CLEAR_ACHIEVEMENTS,
  CHALLENGE_STREAK_ACHIEVEMENTS,
  NO_HIT_WINDOWS_MS,
  SCORE_ACHIEVEMENT_MILESTONES
} from "../config/achievements";
import {
  createRunId,
  emitRunStart,
  emitRunEnd,
  emitDeathSource,
  emitPickupUsage,
  emitBossOutcome,
  emitChallengePerformance
} from "../game/telemetry";
import {
  getHighScore,
  setHighScore,
  getBestSurvivalSeconds,
  setBestSurvivalSeconds,
  getSettings,
  getLastCompletedLevel,
  setLastCompletedLevel,
  getSelectedArchetype,
  setSelectedArchetype,
  addMetaFragments,
  shouldShowTutorial,
  getActiveContracts,
  updateContracts,
  claimCompletedContract,
  getSave
} from "../save/saveManager";
import { GAME_MODES, getModeConfig, isHazardDescriptor, normalizeGameMode } from "../game/modeConfig";
import {
  unlockAchievement,
  submitRunLeaderboards,
  setRichPresence,
  uploadTelemetryBatch
} from "../services/onlineService";
import { grantMetaCurrency, getNextUnlockHint, getRunStartModifiers } from "../game/metaProgression";
import { getBossAttackProfile, shouldEnterPhaseTwo } from "../game/bossEncounter";
import { rollBossReward, buildBossRewardPickup } from "../game/bossRewards";

const SCORE_TICK_MS = 1000;
const MILESTONES = [25, 50, 100, 250, 400, 500];
const PLAYER_SPEED = 430;
const PLAYER_START_X = GAME_WIDTH / 2;
const PLAYER_START_Y = GAME_HEIGHT - 130;
const PHASE_BAR_WIDTH = 320;
const PHASE_BAR_MIN_WIDTH = 6;

/** Default tint/scale when descriptor omits them; keeps hazards and pickups readable and consistent. */
const HAZARD_VISUAL_DEFAULTS = { tint: theme.colors.semantic.game.hazardDefault, scale: 1 };
const PICKUP_VISUAL_DEFAULTS = { tint: theme.colors.semantic.game.pickupShield, scale: 0.18 };

/** Click-to-destroy: cooldown between clicks (ms). */
const CLICK_COOLDOWN_MS = 150;
/** Max chain depth when building destroy queue from player click. */
const MAX_CHAIN_DEPTH = 3;
/** Max hazards + debris on screen; cull when exceeded. */
const MAX_HAZARDS = 80;
/** Max hazards to add to destroy queue in one click (chain cap). */
const MAX_CHAIN_COUNT = 20;
/** Radius (px) to consider neighbors for chain destroy. */
const CHAIN_RADIUS = 100;
/** Chain length at or above this shows "MEGA CHAIN!" and extra juice. */
const MEGA_CHAIN_THRESHOLD = 5;
/** Bonus score per hazard in chain when chain length > 1 (on top of per-type bonus). */
const CHAIN_BONUS_PER_HAZARD = 1;
/** Destroys without taking damage to get streak bonus. */
const DESTROY_STREAK_TARGET = 5;
/** Score bonus when reaching destroy streak. */
const DESTROY_STREAK_BONUS_SCORE = 3;
/** Distance (px) from debris to player to show "CLOSE!" near-miss. */
const NEAR_MISS_DISTANCE = 42;
/** Lingering zone: radius and duration (ms). */
const LINGERING_ZONE_RADIUS = 55;
const LINGERING_ZONE_DURATION_MS = 1500;

export default class DodgeGame extends BaseScene {
  constructor() {
    super(SCENE_KEYS.game);
    this.scoreText = null;
    this.highestScore = null;
    this.phaseText = null;
    this.shieldText = null;
    this.statusText = null;
    this.exitText = null;
    this.phaseBarTrack = null;
    this.phaseBarFill = null;
    this.hazards = null;
    this.pickups = null;
    this.projectiles = null;
    this.bossGroup = null;
    this.activeBoss = null;
    this.movementKeys = null;
    this.gameOverText = null;
    this.gameOverBannerText = null;
    this.gameOverSummaryText = null;
    this.replayButton = null;
    this.music = null;
    this.gameOverMusic = null;
    this.ooGnome = null;
    this.replayTween = null;
    this.highestScoreValue = 0;
    this.runTimeMs = 0;
    this.bonusScore = 0;
    this.gameOverState = false;
    this.currentFallSpeed = 260;
    this.backgroundSpeed = 14;
    this.shieldCharges = 0;
    this.damageRecoveryMs = 0;
    this.exitUnlocked = false;
    this.phaseKey = "";
    this.lastFacing = "right";
    this.spawnDirector = new RunnerSpawnDirector();
    this.challengeDirector = new ChallengeDirector();
    this.challengePanel = null;
    this.challengeText = null;
    this.challengeTimerText = null;
    this.challengeOptionTexts = [];
    this.challengeInputKeys = null;
    this.activeChallenge = null;
    this.challengeRemainingMs = 0;
    this.pendingPerkChoices = null;
    this.perkPoints = 0;
    this.ownedPerks = [];
    this.runModifiers = createBaseModifiers();
    this.objectiveDirector = new ObjectiveDirector();
    this.objectiveText = null;
    this.tempSpeedBoostMs = 0;
    this.tempInvulnMs = 0;
    this.tempScoreMultMs = 0;
    this.tempScoreMultMultiplier = 1;
    this._lastHudScore = null;
    this._lastHudPhaseProgress = null;
    this._lastBestScoreTextValue = null;
    this._lastPhaseTextValue = null;
    this._lastPhaseTextColor = null;
    this._lastShieldTextValue = null;
    this._lastShieldTextColor = null;
    this._lastPhaseBarColor = null;
    this._lastHeatIndicatorVisible = null;
    this._challengeUrgencyTween = null;
    this._challengeUrgencyTweenActive = false;
    this._exitTextPulseTween = null;
    this._phaseBarPulseTween = null;
    this._shieldPulseTween = null;
    this._statusTextTween = null;
    this._scoreTextTween = null;
    this._objectivePulseTween = null;
    this._lastPhaseBarWidthTarget = null;
    this._justSetNewRecord = false;
    this._justSetNewTimePb = false;
    this._lastMilestoneCelebrated = 0;
    this._lastScoreTickSecond = -1;
    this._getReadyRemainingMs = 0;
    this._getReadyOverlay = null;
    this._challengePanelTween = null;
    this._phasePowerupSprite = null;
    this.heatIndicator = null;
    this.perkOptionIcons = null;
    this.paused = false;
    this.pausePanel = null;
    this._initialHighScore = 0;
    this._richPresenceThrottle = 0;
    this._destroyQueue = null;
    this._lastClickMs = null;
    this._destroyStreakCount = 0;
    this._damageZones = [];
    this.bossClears = 0;
    this.completedChallenges = 0;
    this._lastRunSummary = null;
    this.mode = GAME_MODES.Classic;
    this.modeConfig = getModeConfig(this.mode);
    this.nextChallengeScore = 0;
    this.nextDraftPerkAtMs = Infinity;
    this.archetypeText = null;
    this.selectedArchetypeId = "all-rounder";
    this.currentArchetypeName = "All-Rounder";
    this.accessibilitySettings = null;
    this.lastDeathSource = "Unknown hazard";
    this.runRewardTotals = { score: 0, shields: 0, perkPoints: 0 };
    this.challengeOutcomeLog = [];
    this.objectiveOutcomeLog = [];
    this.contracts = [];
    this.runArchetypes = new Set();
    this.lastContractClaims = [];
    this._hazardsDestroyedThisRun = 0;
    this._maxContractRunScore = 0;
    this.challengeSuccessStreak = 0;
    this.bossClearsThisRun = 0;
    this.noHitWindowMs = 0;
    this._lastNoHitAchievementMs = 0;
    this.currentRunId = null;
  }

  init(data) {
    this._returnData = data || {};
    this.mode = normalizeGameMode(this._returnData.mode);
    this.modeConfig = getModeConfig(this.mode);
    this.spawnDirector.setModeTuning({
      bossCooldownScale: this.modeConfig.bossCooldownScale,
      bossChanceBonus: this.mode === GAME_MODES.BossRush ? 0.2 : 0,
      bossTriggerScore: this.mode === GAME_MODES.BossRush ? 8 : undefined
    });
    this.selectedArchetypeId = this._returnData.archetypeId || getSelectedArchetype();
    setSelectedArchetype(this.selectedArchetypeId);
    this.currentArchetypeName = getArchetypeById(this.selectedArchetypeId).name;
  }

  preload() {
    super.preload();
    this._loadError = false;
    this.load.on("loaderror", () => {
      this._loadError = true;
    });
    this.load.audio("musicBack", musicBack);
    this.load.audio("gameOver", gameOver);
    this.load.audio("ooGnome", ooGnome);
  }

  create() {
    if (this._loadError) {
      const msg = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, "Something went wrong loading the game.", {
        font: "700 28px Arial",
        fill: theme.colors.semantic.stroke.gameOver,
        align: "center"
      });
      msg.setOrigin(0.5, 0.5);
      const retry = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20, "Retry", {
        font: "700 24px Arial",
        fill: theme.colors.semantic.text.accent
      });
      retry.setOrigin(0.5, 0.5);
      retry.setPadding(28, 14);
      retry.setInteractive({ useHandCursor: true });
      retry.on("pointerdown", () => this.scene.restart());
      return;
    }
    if (!this._returnData?.skipTutorialGate && shouldShowTutorial()) {
      this.scene.start(SCENE_KEYS.tutorial, {
        returnTo: SCENE_KEYS.game,
        returnData: {
          ...this._returnData,
          mode: this.mode,
          archetypeId: this.selectedArchetypeId,
          skipTutorialGate: true
        }
      });
      return;
    }

    super.createSceneShell(PLAYER_START_X, "mummy");
    this.input.keyboard.resetKeys();
    this.platforms.clear(true, true);
    this.player.body.setAllowGravity(false);
    this.player.setPosition(PLAYER_START_X, PLAYER_START_Y);
    this.player.setDepth(theme.zIndex.gameplay);

    // Atmosphere overlay: vertical gradient (transparent top → dark bottom) for depth
    const overlayTint = parseInt(theme.colors.semantic.background.overlay.replace("#", ""), 16);
    this.atmosphereOverlay = this.add.graphics();
    this.atmosphereOverlay.fillGradientStyle(
      theme.colors.base.blackHex,
      theme.colors.base.blackHex,
      overlayTint,
      overlayTint,
      0,
      0,
      0.5,
      0.5
    );
    this.atmosphereOverlay.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.atmosphereOverlay.setDepth(theme.zIndex.background + 1);
    this.atmosphereOverlay.setScrollFactor(0);

    if (this.player.postFX) {
      try {
        this.player.postFX.addGlow(theme.colors.semantic.game.playerGlow, 2, 0, false, 0.1, 12);
      } catch (_) {
        this.tweens.add({
          targets: this.player,
          alpha: 0.92,
          duration: 600,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut"
        });
      }
    } else {
      this.tweens.add({
        targets: this.player,
        alpha: 0.92,
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
      });
    }

    this.movementKeys = this.input.keyboard.addKeys("W,A,S,D");
    this.escKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.replayKeyR = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.replayKeySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.createRuntimeTextures();
    ensureProceduralUiAssets(this);
    this.refreshAccessibilitySettings();
    this.createHud();
    this._initialHighScore = getHighScore(this.mode);
    this.highestScoreValue = this._initialHighScore;
    if (this.highestScore) {
      const t = getBestSurvivalSeconds(this.mode);
      this.highestScore.setText(
        `${this.modeConfig.label} Best score: ${this.highestScoreValue} · Best time: ${t > 0 ? `${t}s` : "—"}`
      );
    }
    this.createChallengeUi();
    this.createAudio();
    this.createGroups();
    this.createCollisions();
    this.resetRun();
    this.showGetReadyOverlay();

    if (this._returnData && this._returnData.paused) {
      this.paused = true;
      this.physics.pause();
      if (this.music) this.music.pause();
      this.showPausePanel();
    } else {
      setRichPresence("In game");
    }

    const pauseOnFocusLoss = () => {
      this.input.keyboard.resetKeys();
      if (!this.gameOverState && !this.paused && !this.activeChallenge && !this.pendingPerkChoices) {
        this.pause();
      }
    };
    this.game.events.on("blur", pauseOnFocusLoss);
    this.game.events.on("hidden", pauseOnFocusLoss);
    this.events.once("shutdown", () => {
      this.game.events.off("blur", pauseOnFocusLoss);
      this.game.events.off("hidden", pauseOnFocusLoss);
      this.stopAudio();
      this.input.off("pointerdown", this.onPointerDown, this);
    });
    this._destroyQueue = new Set();
    this.input.on("pointerdown", this.onPointerDown, this);
  }

  showGetReadyOverlay() {
    if (this._getReadyOverlay) {
      this._getReadyOverlay.destroy();
      this._getReadyOverlay = null;
    }
    this._getReadyRemainingMs = 2200;
    const getReadyText = this.add.text(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      "Get Ready!",
      { fontSize: "52px", fill: theme.colors.semantic.text.status, fontStyle: "bold" }
    );
    getReadyText.setOrigin(0.5, 0.5);
    getReadyText.setDepth(theme.zIndex.getReady);
    getReadyText.setAlpha(0);
    this._getReadyOverlay = getReadyText;

    this.tweens.add({
      targets: getReadyText,
      alpha: 1,
      duration: 400,
      ease: "Power2.Out"
    });
    this.time.delayedCall(1800, () => {
      this.tweens.add({
        targets: getReadyText,
        alpha: 0,
        duration: 400,
        ease: "Power2.In",
        onComplete: () => {
          if (getReadyText.scene) {
            getReadyText.destroy();
          }
          this._getReadyOverlay = null;
        }
      });
    });
  }

  createRuntimeTextures() {
    if (this.textures.exists("proc-orb-0")) {
      return;
    }
    const families = Object.keys(DEFAULT_PROCEDURAL_PARAMS);
    for (let i = 0; i < families.length; i += 1) {
      const params = DEFAULT_PROCEDURAL_PARAMS[families[i]];
      ensureProceduralTexture(this, params);
    }
  }

  createAudio() {
    const settings = getSettings();
    this.music = this.sound.add("musicBack");
    this.music.setLoop(true);
    this.music.setVolume(settings.musicVolume != null ? settings.musicVolume : 1);
    this.gameOverMusic = this.sound.add("gameOver");
    this.ooGnome = this.sound.add("ooGnome");
    this._sfxVolume = settings.sfxVolume != null ? settings.sfxVolume : 1;
  }

  refreshAccessibilitySettings() {
    const settings = getSettings();
    const shake = settings.screenShakeIntensity ?? 1;
    const flash = settings.flashIntensity ?? 1;
    const safe = Boolean(settings.reduceMotionSafeMode);
    this.accessibilitySettings = {
      screenShakeIntensity: safe ? Math.min(shake, 0.35) : shake,
      flashIntensity: safe ? Math.min(flash, 0.45) : flash,
      colorBlindPaletteMode: settings.colorBlindPaletteMode || "off"
    };
  }

  shakeCamera(duration, amount) {
    const intensity = this.accessibilitySettings?.screenShakeIntensity ?? 1;
    if (intensity <= 0) return;
    cameraShake(this, duration, amount * intensity);
  }

  flashCamera(duration, r, g, b) {
    const intensity = this.accessibilitySettings?.flashIntensity ?? 1;
    if (intensity <= 0) return;
    this.cameras.main.flash(duration, Math.floor(r * intensity), Math.floor(g * intensity), Math.floor(b * intensity), false);
  }

  mapHazardTint(baseTint) {
    const mode = this.accessibilitySettings?.colorBlindPaletteMode || "off";
    if (mode === "off") return baseTint;
    const rgb = Phaser.Display.Color.IntegerToRGB(baseTint ?? theme.colors.semantic.game.hazardDefault);
    const isWarm = rgb.r >= rgb.g && rgb.r >= rgb.b;
    const isCool = rgb.b >= rgb.r && rgb.b >= rgb.g;
    const palette = {
      protanopia: theme.colors.semantic.accessibility.protanopia,
      deuteranopia: theme.colors.semantic.accessibility.deuteranopia,
      tritanopia: theme.colors.semantic.accessibility.tritanopia
    }[mode] || theme.colors.semantic.accessibility.default;
    if (isWarm) return palette.warm;
    if (isCool) return palette.cool;
    return palette.mid;
  }

  /**
   * Play ooGnome with given rate/volume (from DODGE_AUDIO). Use for phase change, exit unlock, objective/challenge complete.
   */
  playEventSfx(sfxKey) {
    const cfg = DODGE_AUDIO[sfxKey];
    if (!cfg) return;
    const vol = (this._sfxVolume != null ? this._sfxVolume : 1) * (cfg.volume || 0.2);
    this.ooGnome.setRate(cfg.rate);
    this.ooGnome.setVolume(vol);
    this.ooGnome.play();
  }

  createGroups() {
    this.hazards = this.physics.add.group();
    this.pickups = this.physics.add.group();
    this.projectiles = this.physics.add.group();
    this.bossGroup = this.physics.add.group();
  }

  createCollisions() {
    this.physics.add.overlap(this.player, this.hazards, (_, hazard) =>
      this.handleHazardHit(hazard)
    );
    this.physics.add.overlap(this.player, this.projectiles, (_, projectile) =>
      this.handleHazardHit(projectile)
    );
    this.physics.add.overlap(this.player, this.bossGroup, (_, boss) =>
      this.handleHazardHit(boss)
    );
    this.physics.add.overlap(this.player, this.pickups, (_, pickup) =>
      this.handlePickupCollision(pickup)
    );
    this.physics.add.overlap(this.hazards, this.hazards, (a, b) =>
      this.handleHazardHazardOverlap(a, b)
    );
  }

  /**
   * When debris overlaps another hazard, queue the non-debris hazard for destroy and process once.
   */
  handleHazardHazardOverlap(a, b) {
    if (a === b || !a?.body || !b?.body || !a.active || !b.active) return;
    if (a.getData("debris")) {
      this.queueDestroy(b, "debris", 0);
    } else if (b.getData("debris")) {
      this.queueDestroy(a, "debris", 0);
    }
    if (this._destroyQueue?.size) {
      this.processDestroyQueue();
    }
  }

  /**
   * Get the hazard at world (x, y). Prefer smallest by area (topmost visual). Used for click-to-destroy.
   */
  getHazardAt(x, y) {
    if (!this.hazards?.getLength()) return null;
    const containing = [];
    this.hazards.getChildren().forEach(hazard => {
      if (!hazard.body || !hazard.active) return;
      const b = hazard.body;
      if (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) {
        containing.push(hazard);
      }
    });
    if (containing.length === 0) return null;
    containing.sort((a, b) => (a.displayWidth * a.displayHeight) - (b.displayWidth * b.displayHeight));
    return containing[0];
  }

  onPointerDown(pointer) {
    if (this.gameOverState || this.paused || this._getReadyRemainingMs > 0 || this.activeChallenge || this.pendingPerkChoices) {
      return;
    }
    const x = pointer.worldX;
    const y = pointer.worldY;
    const hazard = this.getHazardAt(x, y);
    if (!hazard) return;
    if (this._lastClickMs != null && (this.runTimeMs - this._lastClickMs) < CLICK_COOLDOWN_MS) {
      return;
    }
    this._lastClickMs = this.runTimeMs;
    this.buildChainQueue(hazard);
    this.processDestroyQueue();
  }

  /**
   * Get hazards within CHAIN_RADIUS of (x, y), excluding excludeHazard.
   */
  getNeighborsInRadius(x, y, excludeHazard) {
    const out = [];
    const r2 = CHAIN_RADIUS * CHAIN_RADIUS;
    this.hazards.getChildren().forEach(h => {
      if (h === excludeHazard || !h.body || !h.active) return;
      const dx = h.x - x;
      const dy = h.y - y;
      if (dx * dx + dy * dy <= r2) out.push(h);
    });
    return out;
  }

  /**
   * Build destroy queue from a player click: add clicked hazard and BFS chain neighbors up to MAX_CHAIN_DEPTH and MAX_CHAIN_COUNT.
   */
  buildChainQueue(clickedHazard) {
    this._destroyQueue.clear();
    this._destroyQueue.add(clickedHazard);
    let frontier = [clickedHazard];
    let depth = 0;
    while (depth < MAX_CHAIN_DEPTH && this._destroyQueue.size < MAX_CHAIN_COUNT) {
      const nextFrontier = [];
      frontier.forEach(h => {
        const neighbors = this.getNeighborsInRadius(h.x, h.y, h);
        neighbors.forEach(n => {
          if (!this._destroyQueue.has(n) && this._destroyQueue.size < MAX_CHAIN_COUNT) {
            this._destroyQueue.add(n);
            nextFrontier.push(n);
          }
        });
      });
      frontier = nextFrontier;
      if (frontier.length === 0) break;
      depth += 1;
    }
  }

  /**
   * Add a hazard to the destroy queue. source: "player" | "debris" | "chain". depth used for chain cap.
   */
  queueDestroy(hazard, source, depth = 0) {
    if (!hazard || !this.hazards.contains(hazard) || this._destroyQueue.has(hazard)) return;
    if (source === "chain" && depth > MAX_CHAIN_DEPTH) return;
    this._destroyQueue.add(hazard);
  }

  /**
   * Spawn debris hazards from a destroyed debrisLauncher. Small orbs with debris flag and grace period.
   */
  spawnDebrisChildren(hazard) {
    const hx = hazard.x;
    const hy = hazard.y;
    const count = hazard.getData("debrisCount") ?? 8;
    const speed = 200;
    const graceFrames = 2;
    const offsetDist = 10;
    for (let i = 0; i < count; i += 1) {
      if (this.hazards.count >= MAX_HAZARDS) break;
      const angle = (i * 2 * Math.PI) / count + (Math.random() * 0.3);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const ox = offsetDist * (Math.random() - 0.5);
      const oy = offsetDist * (Math.random() - 0.5);
      const descriptor = {
        kind: "hazard",
        type: "meteor",
        texture: "runner-orb",
        tint: hazard.tint ?? theme.colors.semantic.game.phaseGreen,
        x: hx + ox,
        y: hy + oy,
        speed,
        velocityX: vx,
        velocityY: vy,
        scaleX: 0.28,
        scaleY: 0.28,
        hitbox: { shape: "circle", radius: 12 },
        rotationSpeed: 180,
        motion: { type: "none" },
        destroyArchetype: "clean",
        debris: true,
        graceFrames
      };
      this.spawnHazard(descriptor);
    }
  }

  /**
   * Spawn a lingering damage zone at (x, y). Damages player on overlap until it expires.
   */
  spawnLingeringZone(x, y, tint) {
    const defaultLingeringTint = theme.colors.semantic.game.phaseAmber;
    const mask = theme.colors.base.whiteHex;
    const graphic = this.add.circle(x, y, LINGERING_ZONE_RADIUS, (tint ?? defaultLingeringTint) & mask, 0.35);
    graphic.setStrokeStyle(theme.components.hud.stroke.width, (tint ?? defaultLingeringTint) & mask, 0.6);
    graphic.setDepth(theme.zIndex.pickups);
    this._damageZones.push({
      x,
      y,
      radius: LINGERING_ZONE_RADIUS,
      remainingMs: LINGERING_ZONE_DURATION_MS,
      graphic
    });
    this.tweens.add({
      targets: graphic,
      alpha: 0.12,
      duration: LINGERING_ZONE_DURATION_MS,
      ease: "Power2.In"
    });
  }

  /**
   * Update lingering damage zones: tick down, damage player if overlapping, remove when expired.
   */
  updateDamageZones(delta) {
    const player = this.player;
    if (!player?.body) return;
    const px = player.x;
    const py = player.y;
    for (let i = this._damageZones.length - 1; i >= 0; i -= 1) {
      const z = this._damageZones[i];
      z.remainingMs -= delta;
      if (z.remainingMs <= 0) {
        if (z.graphic?.scene) z.graphic.destroy();
        this._damageZones.splice(i, 1);
        continue;
      }
      const dx = px - z.x;
      const dy = py - z.y;
      if (dx * dx + dy * dy <= z.radius * z.radius) {
        const fakeSource = { getData: (k) => (k === "debris" ? false : k === "graceFrames" ? 0 : undefined) };
        this.handleHazardHit(fakeSource);
        if (z.graphic?.scene) z.graphic.destroy();
        this._damageZones.splice(i, 1);
      }
    }
  }

  /**
   * Spawn N small hazards in a star pattern from (x, y). Bias directions away from player.
   */
  spawnSplitChildren(hazard) {
    const hx = hazard.x;
    const hy = hazard.y;
    const type = hazard.getData("type") ?? "meteor";
    const count = hazard.getData("splitCount") ?? 5;
    const template = OBSTACLE_LIBRARY[type] || OBSTACLE_LIBRARY.meteor;
    const speed = 220;
    const smallScale = 0.5 * Math.min(hazard.scaleX ?? 1, hazard.scaleY ?? 1);
    const angleToPlayer = Math.atan2(
      this.player.y - hy,
      this.player.x - hx
    );
    const biasOffset = angleToPlayer + Math.PI / count;
    for (let i = 0; i < count; i += 1) {
      if (this.hazards.count >= MAX_HAZARDS) break;
      const angle = biasOffset + (i * 2 * Math.PI) / count;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const descriptor = {
        kind: "hazard",
        type,
        texture: template.texture,
        tint: hazard.tint ?? template.tint,
        x: hx,
        y: hy,
        speed,
        velocityX: vx,
        velocityY: vy,
        scaleX: smallScale,
        scaleY: smallScale,
        hitbox: { shape: "circle", radius: 16 },
        rotationSpeed: template.rotationSpeed ?? 0,
        motion: { type: "none" },
        destroyArchetype: "clean"
      };
      this.spawnHazard(descriptor);
    }
  }

  /**
   * Process the destroy queue once: remove hazards, VFX, score, and run on-destroy effects (clean / splitter / debrisLauncher / lingering).
   */
  processDestroyQueue() {
    if (!this._destroyQueue?.size) return;
    const list = Array.from(this._destroyQueue);
    this._destroyQueue.clear();
    const chainLength = list.length;
    if (chainLength > 1) {
      this.playEventSfx("sfxChainDestroy");
    } else {
      this.playEventSfx("sfxDestroy");
    }
    if (chainLength >= MEGA_CHAIN_THRESHOLD) {
      cameraShake(this, 280, 0.008);
      showFloatingText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, "MEGA CHAIN!", theme.colors.semantic.text.bossTimer);
      this.recordContractEvent({ type: "megaChain" });
    }
    list.forEach((hazard, index) => {
      if (!hazard.scene || !this.hazards.contains(hazard)) return;
      const archetype = hazard.getData("destroyArchetype") ?? "clean";
      const tint = hazard.tint ?? HAZARD_VISUAL_DEFAULTS.tint;
      const hx = hazard.x;
      const hy = hazard.y;
      if (archetype === "splitter") {
        this.spawnSplitChildren(hazard);
      } else if (archetype === "debrisLauncher") {
        this.spawnDebrisChildren(hazard);
      } else if (archetype === "lingering") {
        this.spawnLingeringZone(hx, hy, tint);
      }
      this.hazards.remove(hazard);
      hazard.destroy();
      this.emitParticleBurst(hx, hy, 8, 280, 0.3, tint);
      const scoreBonus = archetype === "clean" ? 1 : archetype === "splitter" ? 2 : archetype === "debrisLauncher" ? 3 : 2;
      this.bonusScore += scoreBonus;
      if (chainLength > 1 && index === 0) {
        showFloatingText(this, hx, hy - 30, `x${chainLength}`, theme.colors.semantic.text.score);
      }
    });
    if (chainLength > 1) {
      this.bonusScore += (chainLength - 1) * CHAIN_BONUS_PER_HAZARD;
    }
    this._hazardsDestroyedThisRun += chainLength;
    this.recordContractEvent({ type: "hazardDestroyed", count: chainLength });
    this._destroyStreakCount += list.length;
    if (this._destroyStreakCount >= DESTROY_STREAK_TARGET) {
      showFloatingText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 100, `${DESTROY_STREAK_TARGET}x Destroy!`, theme.colors.semantic.text.success);
      this.bonusScore += DESTROY_STREAK_BONUS_SCORE;
      this._destroyStreakCount = 0;
    }
  }

  createHud() {
    createMobileRunHud(this);
    this.scoreText = this.add.text(24, 18, "Score: 0", DODGE_HUD_STYLES.scoreText);
    this.scoreText.setStroke(HUD_STROKE.color, HUD_STROKE.width);

    this.highestScore = this.add.text(theme.spacing[6], theme.spacing[16], "Best: 0", { ...DODGE_HUD_STYLES.highestScore, wordWrap: { width: theme.spacing[64] + theme.spacing[32] } });

    this.phaseText = this.add.text(912, theme.spacing[18], "Pressure: Recovery", DODGE_HUD_STYLES.phaseText);
    this.phaseText.setStroke(HUD_STROKE.color, HUD_STROKE.width);

    this.shieldText = this.add.text(912, theme.spacing[24] + theme.spacing[2], "Shields: 0/3", DODGE_HUD_STYLES.shieldText);
    this.archetypeText = this.add.text(theme.spacing[6], theme.spacing[24], `Archetype: ${this.currentArchetypeName}`, DODGE_HUD_STYLES.objectiveText);

    this.statusText = this.add.text(
      GAME_WIDTH / 2,
      theme.spacing[20],
      "Recovery phases widen the rain. Heat phases compress the fall lanes.",
      { ...DODGE_HUD_STYLES.statusText, wordWrap: { width: theme.spacing[64] + theme.spacing[32] } }
    );
    this.statusText.setOrigin(0.5, 0.5);
    this.statusText.setStroke(HUD_STROKE.color, HUD_STROKE.width);

    // Phase bar track: rounded rect, left edge at 912, vertical center at 116 (Graphics has no setOrigin)
    const phaseBarHeight = 18;
    const phaseBarX = 912;
    const phaseBarY = theme.spacing[32] + theme.spacing[5];
    this.phaseBarTrack = this.add.graphics();
    this.phaseBarTrack.setPosition(phaseBarX + PHASE_BAR_WIDTH / 2, phaseBarY);
    this.phaseBarTrack.fillStyle(parseInt(theme.colors.semantic.background.panel.replace("#", ""), 16), 0.95);
    this.phaseBarTrack.fillRoundedRect(-PHASE_BAR_WIDTH / 2, -phaseBarHeight / 2, PHASE_BAR_WIDTH, phaseBarHeight, 9);
    this.phaseBarTrack.lineStyle(1, theme.colors.semantic.game.phaseCyan, 0.5);
    this.phaseBarTrack.strokeRoundedRect(-PHASE_BAR_WIDTH / 2, -phaseBarHeight / 2, PHASE_BAR_WIDTH, phaseBarHeight, 9);

    this.phaseBarFill = this.add
      .rectangle(phaseBarX, phaseBarY, theme.components.hud.phaseBar.minWidth, 12, theme.colors.semantic.game.phaseCyan, 1)
      .setOrigin(0, 0.5);

    this.exitText = this.add.text(
      GAME_WIDTH / 2,
      GAME_HEIGHT - 38,
      "",
      DODGE_HUD_STYLES.statusText
    );
    this.exitText.setOrigin(0.5, 0.5);

    this.objectiveText = this.add.text(theme.spacing[6], theme.spacing[32], "Objectives", { ...DODGE_HUD_STYLES.objectiveText, lineSpacing: theme.spacing[1], wordWrap: { width: theme.spacing[64] + theme.spacing[32] } });

    this.bossTimerText = this.add.text(912, 200, "", DODGE_HUD_STYLES.bossTimerText);
    this.bossTimerText.setVisible(false);

    // Heat / intensity indicator (visible during Heat phase or when boss active)
    this.heatIndicator = this.add.image(1040, theme.spacing[64], "stageIntensityHeat");
    this.heatIndicator.setScale(0.2);
    this.heatIndicator.setVisible(false);
    this.heatIndicator.setDepth(theme.zIndex.pickups - 1);

    this.phaseBarHint = this.add
      .text(912 + PHASE_BAR_WIDTH / 2, phaseBarY + 16, "Bar fill → more heat", {
        font: "12px Arial",
        fill: theme.colors.semantic.text.muted
      })
      .setOrigin(0.5, 0);

    // Pause button: click/touch or Escape to open pause menu
    this.pauseButton = this.add.text(GAME_WIDTH - theme.spacing[6], 36, "Pause", {
      font: "700 24px Arial",
      fill: theme.colors.semantic.text.accent
    });
    this.pauseButton.setOrigin(1, 0.5);
    this.pauseButton.setDepth(theme.zIndex.hud);
    this.pauseButton.setPadding(12, 8);
    this.pauseButton.setInteractive({ useHandCursor: true });
    this.pauseButton.on("pointerdown", () => {
      if (!this.gameOverState && !this.paused && this._getReadyRemainingMs <= 0 && !this.activeChallenge && !this.pendingPerkChoices) {
        this.pause();
      }
    });
    this.pauseButton.on("pointerover", () => this.pauseButton.setScale(1.05));
    this.pauseButton.on("pointerout", () => this.pauseButton.setScale(1));
  }

  resetRun() {
    this.stopAudio();
    this.stopPhaseBarPulse();
    this.physics.resume();
    this.input.keyboard.resetKeys();
    this.spawnDirector.reset();
    this.clearGameOverUi();
    this.clearGroups();
    this.pauseButton?.setVisible(true);

    this.runTimeMs = 0;
    this.bonusScore = 0;
    this.bossClears = 0;
    this.completedChallenges = 0;
    this._lastRunSummary = null;
    this.currentFallSpeed = 260;
    this.backgroundSpeed = 14;
    this.damageRecoveryMs = 0;
    this.gameOverState = false;
    this.exitUnlocked = false;
    this.phaseKey = "";
    this.lastFacing = "right";
    this.activeBoss = null;
    this.challengeDirector.reset();
    this.activeChallenge = null;
    this.challengeRemainingMs = 0;
    this.pendingPerkChoices = null;
    this.perkPoints = 0;
    this.ownedPerks = [];
    this.runModifiers = applyArchetypeToModifiers(
      getRunStartModifiers(createBaseModifiers()),
      this.selectedArchetypeId
    );
    const daily = applyDailyModifier(this.runModifiers, getContractDateKey());
    this.runModifiers = daily.modifiers;
    this._dailyContractProgressMult = daily.contractProgressMultiplier ?? 1;
    this._dailyPassiveScorePerSec = daily.passiveScorePerSec ?? 0;
    this._dailyFallMult = daily.fallSpeedScale ?? 1;
    this.spawnDirector.setFallSpeedScale(daily.fallSpeedScale ?? 1);
    this.refreshAccessibilitySettings();
    this.currentArchetypeName = getArchetypeById(this.selectedArchetypeId).name;
    this.nextChallengeScore = this.modeConfig.challengeScoreInterval;
    this.nextDraftPerkAtMs = this.modeConfig.draftPerkIntervalSeconds
      ? this.modeConfig.draftPerkIntervalSeconds * 1000
      : Infinity;
    if (this.archetypeText) {
      this.archetypeText.setText(`Archetype: ${this.currentArchetypeName}`);
    }
    this.objectiveDirector.reset();
    this.shieldCharges = this.runModifiers.maxShields;
    this.currentRunId = createRunId();
    emitRunStart({
      runId: this.currentRunId,
      phase: "recovery",
      startingShields: this.shieldCharges
    });
    this.challengePanel?.setVisible(false);
    this.stopChallengeUrgencyTween();
    this.bossTimerText?.setVisible(false);
    this.tempSpeedBoostMs = 0;
    this.tempInvulnMs = 0;
    this.tempScoreMultMs = 0;
    this.tempScoreMultMultiplier = 1;
    this._lastMilestoneCelebrated = 0;
    this._lastScoreTickSecond = -1;
    this.lastDeathSource = "Unknown hazard";
    this.runRewardTotals = { score: 0, shields: 0, perkPoints: 0 };
    this.challengeOutcomeLog = [];
    this.objectiveOutcomeLog = [];
    this.challengeSuccessStreak = 0;
    this.bossClearsThisRun = 0;
    this._maxContractRunScore = 0;
    this.noHitWindowMs = 0;
    this._lastNoHitAchievementMs = 0;
    this._getReadyRemainingMs = 0;
    this._lastHudScore = null;
    this._lastHudPhaseProgress = null;
    this._lastBestScoreTextValue = null;
    this._lastPhaseTextValue = null;
    this._lastPhaseTextColor = null;
    this._lastShieldTextValue = null;
    this._lastShieldTextColor = null;
    this._lastPhaseBarColor = null;
    this._lastHeatIndicatorVisible = null;
    this._lastPhaseBarWidthTarget = null;
    this.renderObjectives();
    this.contracts = getActiveContracts().map(contract => ({ ...contract }));
    this.runArchetypes = new Set();
    this.lastContractClaims = [];
    this._hazardsDestroyedThisRun = 0;

    this.player.clearTint();
    this.player.setAlpha(1);
    this.player.setPosition(PLAYER_START_X, PLAYER_START_Y);
    this.player.setVelocity(0, 0);
    this.player.anims.play("flex", true);
    this.updateHud({
      phaseLabel: "Recovery",
      phaseColor: theme.colors.semantic.game.phaseCyan,
      phaseProgress: 0
    });
    this.setStatusText(
      `${this.modeConfig.label}: Recovery phases widen the rain. Heat phases compress the fall lanes.`,
      theme.colors.semantic.game.pickupShield
    );
    if (this._exitTextPulseTween) {
      this._exitTextPulseTween.stop();
      this._exitTextPulseTween = null;
    }
    if (this._shieldPulseTween) {
      this._shieldPulseTween.stop();
      this._shieldPulseTween = null;
    }
    if (this._statusTextTween) {
      this._statusTextTween.stop();
      this._statusTextTween = null;
    }
    if (this._scoreTextTween) {
      this._scoreTextTween.stop();
      this._scoreTextTween = null;
    }
    if (this.scoreText) {
      this.scoreText.setScale(1);
    }
    if (this.statusText) {
      this.statusText.setScale(1);
    }
    if (this.shieldText) {
      this.shieldText.setScale(1);
    }
    if (this._objectivePulseTween) {
      this._objectivePulseTween.stop();
      this._objectivePulseTween = null;
    }
    if (this.objectiveText) {
      this.objectiveText.setScale(1);
    }
    this.exitText.setAlpha(1);
    this.exitText.setText("");

    const settings = getSettings();
    this.music.setVolume(settings.musicVolume != null ? settings.musicVolume : 1);
    this._sfxVolume = settings.sfxVolume != null ? settings.sfxVolume : 1;
    this.music.play();
  }

  clearGroups() {
    this._destroyQueue?.clear();
    this._lastClickMs = null;
    this._destroyStreakCount = 0;
    this._damageZones.forEach(z => {
      if (z.graphic?.scene) z.graphic.destroy();
    });
    this._damageZones = [];
    [this.hazards, this.pickups, this.projectiles, this.bossGroup].forEach(group => {
      group?.clear(true, true);
    });
  }

  clearGameOverUi() {
    if (this.replayTween) {
      this.replayTween.stop();
      this.replayTween = null;
    }

    if (this.replayButton) {
      this.replayButton.removeAllListeners();
      this.replayButton.destroy();
      this.replayButton = null;
    }
    if (this.replayButtonPanel) {
      this.replayButtonPanel.destroy();
      this.replayButtonPanel = null;
    }
    if (this.playAgainText) {
      this.playAgainText.destroy();
      this.playAgainText = null;
    }

    if (this.gameOverText) {
      this.gameOverText.destroy();
      this.gameOverText = null;
    }
    if (this.gameOverSummaryText) {
      this.gameOverSummaryText.destroy();
      this.gameOverSummaryText = null;
    }
    if (this.gameOverBannerText) {
      this.gameOverBannerText.destroy();
      this.gameOverBannerText = null;
    }
    if (this.gameOverPanel) {
      this.gameOverPanel.destroy();
      this.gameOverPanel = null;
    }
  }

  stopAudio() {
    [this.music, this.gameOverMusic, this.ooGnome].forEach(sound => {
      if (sound?.isPlaying) {
        sound.stop();
      }
    });
  }

  getScore() {
    return Math.floor(this.runTimeMs / SCORE_TICK_MS) + this.bonusScore;
  }

  getDisplayScore() {
    return Math.floor(this.getScore());
  }

  /**
   * One-shot particle burst using procedural bolt/orb texture.
   * @param {number} [tint] - Optional hex tint for particles (e.g. theme.colors.semantic.game.phaseCyan). Omit for default (no tint).
   */
  emitParticleBurst(x, y, quantity = 10, lifespan = 350, scaleStart = 0.35, tint) {
    const textureKey = this.textures.exists("proc-bolt-0") ? "proc-bolt-0" : "proc-orb-0";
    const config = {
      emitting: false,
      lifespan,
      speed: { min: 80, max: 180 },
      scale: { start: scaleStart, end: 0 },
      blendMode: "ADD"
    };
    if (tint != null) {
      config.tint = { start: tint, end: tint };
    }
    const emitter = this.add.particles(x, y, textureKey, config);
    emitter.explode(quantity);
    this.time.delayedCall(lifespan + 50, () => emitter.destroy());
  }

  handlePickupCollision(pickup) {
    if (this.gameOverState) {
      return;
    }

    const pickupType = pickup.getData("pickupType") ?? "shield";
    emitPickupUsage({
      runId: this.currentRunId,
      pickupType,
      scoreBefore: this.getScore(),
      shieldCharges: this.shieldCharges
    });
    const px = pickup.x;
    const py = pickup.y;
    const PICKUP_TINTS = {
      shield: theme.colors.semantic.game.pickupShield,
      speed: theme.colors.semantic.game.pickupSpeed,
      invuln: theme.colors.semantic.game.pickupInvuln,
      scoreMult: theme.colors.semantic.game.pickupScoreMult,
      gambit: 0xffc933
    };
    this.emitParticleBurst(px, py, 12, 350, 0.35, PICKUP_TINTS[pickupType] ?? PICKUP_TINTS.shield);
    pickup.destroy();
    this.ooGnome.setRate(0.9 + Math.random() * 0.25);
    this.ooGnome.play();

    if (pickupType === "shield") {
      if (this.shieldCharges < this.runModifiers.maxShields) {
        this.shieldCharges += 1;
        showFloatingText(this, px, py, "+1 Shield", theme.colors.semantic.text.phase);
      } else {
        this.bonusScore += 3;
        this.setStatusText("Shield bank full. Pickup converted into bonus score.", theme.colors.semantic.text.score);
        showFloatingText(this, px, py, "+3 score", theme.colors.semantic.text.score);
      }
    } else if (pickupType === "speed") {
      this.tempSpeedBoostMs = 5000;
      this.setStatusText("Speed boost active! +25% move speed for 5s.", theme.colors.semantic.game.pickupSpeed);
      showFloatingText(this, px, py, "Speed!", theme.colors.semantic.text.accent);
    } else if (pickupType === "invuln") {
      this.tempInvulnMs = 3000;
      this.setStatusText("Invulnerability! No damage for 3s.", theme.colors.semantic.game.pickupInvuln);
      showFloatingText(this, px, py, "Invuln!", theme.colors.semantic.text.accent);
    } else if (pickupType === "scoreMult") {
      this.tempScoreMultMs = 10000;
      this.tempScoreMultMultiplier = 1.5;
      this.setStatusText("Score multiplier! 1.5x score for 10s.", theme.colors.semantic.game.pickupScoreMult);
      showFloatingText(this, px, py, "1.5x Score!", theme.colors.semantic.text.success);
    } else if (pickupType === "gambit") {
      this.bonusScore += 28;
      this.flashCamera(220, 255, 240, 120);
      this.setStatusText("Gambit spark: score burst — expect a bright flash.", theme.colors.semantic.text.score);
      showFloatingText(this, px, py, "+28 Gambit!", theme.colors.semantic.text.score);
      unlockAchievement("risk_gambit");
      this.recordContractEvent({ type: "gambitPickup" });
    }

    this.bonusScore += this.runModifiers.extraScorePerPickup ?? 0;
    this.objectiveDirector.recordPickup();
    this.recordContractEvent({ type: "pickup" });
    this.processObjectiveRewards();

    impactSquash(this, this.player, { flash: true });
    if (this.juice) this.juice.bounce(this.player);
  }

  handleHazardHit(source) {
    if (this.gameOverState || this.damageRecoveryMs > 0) {
      return;
    }

    if (this.tempInvulnMs > 0) {
      return;
    }

    if (source?.getData?.("debris") && (source.getData("graceFrames") ?? 0) > 0) {
      return;
    }

    this._destroyStreakCount = 0;

    if (this.shieldCharges > 0) {
      this.noHitWindowMs = 0;
      this.consumeShield(source);
      return;
    }

    this.lastDeathSource = source?.getData?.("sourceName") || source?.getData?.("sourceKey") || "Hazard";
    this.noHitWindowMs = 0;
    emitDeathSource({
      runId: this.currentRunId,
      sourceType: source?.getData?.("persistent") ? "boss_or_projectile" : "hazard",
      sourceTexture: source?.texture?.key ?? "unknown",
      shieldCharges: this.shieldCharges
    });
    this.endRun();
  }

  consumeShield(source) {
    this.shieldCharges -= 1;
    this.damageRecoveryMs = this.runModifiers.invulnerabilityMs;

    if (!source?.getData?.("persistent")) {
      source?.destroy();
    }

    this.shakeCamera(150, 0.005);
    this.setStatusText("Shield popped. Short invulnerability window active.", theme.colors.semantic.game.phaseAmber);

    this.emitParticleBurst(this.player.x, this.player.y, 6, 280, 0.25, theme.colors.semantic.game.phaseAmber);
    impactSquash(this, this.player, { flash: true });
    if (this.juice) this.juice.shake(this.player);

    this.tweens.add({
      targets: this.player,
      alpha: 0.2,
      duration: 90,
      yoyo: true,
      repeat: 5,
      onComplete: () => {
        if (!this.gameOverState) {
          this.player.setAlpha(1);
        }
      }
    });
  }

  endRun() {
    this.stopAudio();
    this.gameOverMusic.play();
    this.shakeCamera(220, 0.008);
    this.emitParticleBurst(this.player.x, this.player.y, 14, 400, 0.35);
    this.flashCamera(200, 255, 80, 80);
    this.physics.pause();

    const score = this.getScore();
    this.flushRunTelemetry(false, score);
    if (score > this.highestScoreValue) {
      this.highestScoreValue = score;
      setHighScore(score, this.mode);
      this._justSetNewRecord = true;
      if (this._initialHighScore === 0) {
        unlockAchievement("first_run");
      }
    } else {
      this._justSetNewRecord = false;
    }
    submitRunLeaderboards({
      runScore: this.highestScoreValue,
      survivalSeconds: Math.floor(this.runTimeMs / 1000)
    });

    this.highestScore.setText(`${this.modeConfig.label} Best: ${this.highestScoreValue}`);
    this.gameOverState = "ended";
    this.player.setVelocity(0, 0);
    this.player.anims.play("flex", true);

    const survivedSec = Math.floor(this.runTimeMs / 1000);
    this._justSetNewTimePb = setBestSurvivalSeconds(this.mode, survivedSec);

    const runSummary = this.buildRunSummary();
    this.recordContractEvent({ type: "runScore", score: runSummary.score });
    const metaReward = grantMetaCurrency(runSummary);
    this._lastRunSummary = { ...runSummary, metaReward };
    this.claimCompletedContracts();
    this.evaluateRunAchievements();

    this.showGameOver();
  }

  evaluateRunAchievements() {
    const save = getSave();
    const life = save.lifetimeMetaEarned ?? 0;
    if (life >= 500) {
      unlockAchievement("meta_lifetime_500");
    } else if (life >= 100) {
      unlockAchievement("meta_lifetime_100");
    }
    if (Math.floor(this.runTimeMs / 1000) >= 180) {
      unlockAchievement("survive_three_min");
    }
    if (this._hazardsDestroyedThisRun >= 20) {
      unlockAchievement("hazard_demolisher_20");
    }
    if (this.ownedPerks.length >= 5) {
      unlockAchievement("run_five_perks");
    }
    if (this.completedChallenges >= 3) {
      unlockAchievement("challenge_triple_run");
    }
    const score = this.getScore();
    if (this.mode === GAME_MODES.BossRush && score >= 100) {
      unlockAchievement("boss_rush_century");
    }
    const perks = this.ownedPerks;
    if (perks.length >= 3) {
      const onlyMob = perks.every(id => {
        const t = getPerkFeatTags(id);
        return t.length > 0 && t.every(x => x === "mobility");
      });
      if (onlyMob) {
        unlockAchievement("feat_pure_mobility");
      }
      const tagSet = new Set();
      perks.forEach(id => getPerkFeatTags(id).forEach(t => tagSet.add(t)));
      if (score >= 50 && tagSet.has("mobility") && tagSet.has("defense") && tagSet.has("score")) {
        unlockAchievement("feat_triad_build");
      }
    }
  }

  buildRunSummary() {
    const objectives = this.objectiveDirector ? this.objectiveDirector.getObjectives() : [];
    const objectivesCompleted = objectives.filter(objective => objective.completed).length;
    return {
      survivalTimeSec: Math.floor(this.runTimeMs / 1000),
      score: this.getScore(),
      bossClears: this.bossClears,
      objectivesCompleted,
      challengesCompleted: this.completedChallenges
    };
  }

  showGameOver() {
    this.pauseButton?.setVisible(false);
    this.gameOverPanel = this.add
      .rectangle(GAME_WIDTH / 2, 240, 780, 460, parseInt(theme.colors.semantic.background.panel.replace("#", ""), 16), 0.94)
      .setStrokeStyle(theme.components.hud.stroke.width, parseInt(theme.colors.semantic.stroke.gameOver.replace("#", ""), 16), 0.8)
      .setDepth(theme.zIndex.gameOverPanel);

    const runSummary = this._lastRunSummary || this.buildRunSummary();
    const score = runSummary.score;
    const survivedSec = runSummary.survivalTimeSec;
    const objectives = this.objectiveDirector ? this.objectiveDirector.getObjectives() : [];
    const completedCount = objectives.filter(o => o.completed).length;
    const bestTimeSec = getBestSurvivalSeconds(this.mode);
    const bestTimeLabel = bestTimeSec > 0 ? `${bestTimeSec}s` : "—";

    let contractLine = "";
    if (this.lastContractClaims.length > 0) {
      contractLine = `Contracts claimed: ${this.lastContractClaims.map(c => c.title).join(" · ")}`;
    } else if (this.contracts.some(c => c.completed)) {
      contractLine = "Daily contracts progressed — claim on the main menu.";
    }

    const bannerLines = [];
    if (runSummary.metaReward > 0) {
      bannerLines.push(`+${runSummary.metaReward} META CURRENCY`);
    }
    if (this.lastContractClaims.length > 0) {
      bannerLines.push(
        `Contracts ✓ ${this.lastContractClaims.map(c => `${c.title} +${c.reward.currency}c/+${c.reward.fragments}f`).join(" · ")}`
      );
    } else if (this.contracts.length && !contractLine.includes("progressed")) {
      bannerLines.push("Daily contracts: in progress");
    }
    const metaLine =
      runSummary.metaReward <= 0
        ? "Little meta this run — longer survival and higher score earn more."
        : "";

    let recapStartY = 52;
    if (bannerLines.length > 0) {
      this.gameOverBannerText = this.add.text(GAME_WIDTH / 2, 40, bannerLines.join("\n"), {
        fontSize: "28px",
        fontStyle: "bold",
        fill: theme.colors.semantic.text.score,
        align: "center",
        lineSpacing: 8,
        wordWrap: { width: 720 }
      });
      this.gameOverBannerText.setOrigin(0.5, 0);
      this.gameOverBannerText.setDepth(theme.zIndex.gameOverContent + 1);
      this.gameOverBannerText.setAlpha(0);
      this.tweens.add({
        targets: this.gameOverBannerText,
        alpha: 1,
        duration: 200,
        delay: 40,
        ease: "Power2.Out"
      });
      recapStartY = 44 + bannerLines.length * 36;
    }

    const ch = runSummary.challengesCompleted;
    const challengeLine =
      ch === 0
        ? "Challenges: none cleared."
        : ch > 3
          ? `${ch} challenges cleared · last: ${this.challengeOutcomeLog[this.challengeOutcomeLog.length - 1] || "—"}`
          : this.challengeOutcomeLog.slice(-Math.min(3, ch)).join(" · ");

    const pbNote = [this._justSetNewRecord ? "NEW SCORE PB" : null, this._justSetNewTimePb ? "NEW TIME PB" : null]
      .filter(Boolean)
      .join(" · ");

    const recapLines = [
      `Run over · ${this.modeConfig.label} · Score ${score} (best ${this.highestScoreValue})`,
      metaLine,
      this.lastContractClaims.length > 0 ? "" : contractLine,
      `Survival ${survivedSec}s · Best time ${bestTimeLabel}${pbNote ? ` · ${pbNote}` : ""}`,
      `Bosses ${runSummary.bossClears} · Perks ${this.ownedPerks.length} · Objectives ${completedCount}/${objectives.length}`,
      challengeLine,
      `Cause: ${this.lastDeathSource}`
    ].filter(Boolean);

    const tip = getPostRunTip({
      survivalTimeSec: survivedSec,
      challengesCompleted: ch,
      bossClears: runSummary.bossClears,
      score,
      lastDeathSource: this.lastDeathSource
    });
    const footer = [getNextUnlockHint().text, tip].filter(Boolean).join("   |   ");

    this.gameOverText = this.add.text(GAME_WIDTH / 2, recapStartY, recapLines.join("\n"), {
      fontSize: "21px",
      fill: theme.colors.semantic.text.status,
      align: "center",
      lineSpacing: 5,
      wordWrap: { width: 700 }
    });
    this.gameOverText.setOrigin(0.5, 0);
    this.gameOverText.setDepth(theme.zIndex.gameOverContent);
    this.gameOverText.setAlpha(0);
    this.tweens.add({
      targets: this.gameOverText,
      alpha: 1,
      duration: 240,
      delay: 60,
      ease: "Power2.Out"
    });

    this.gameOverSummaryText = this.add.text(GAME_WIDTH / 2, 392, footer, {
      fontSize: "15px",
      fill: theme.colors.semantic.text.muted,
      align: "center",
      wordWrap: { width: 680 }
    });
    this.gameOverSummaryText.setOrigin(0.5, 0.5);
    this.gameOverSummaryText.setDepth(theme.zIndex.gameOverContent);
    this.gameOverSummaryText.setAlpha(0);
    this.tweens.add({
      targets: this.gameOverSummaryText,
      alpha: 1,
      duration: 240,
      delay: 120,
      ease: "Power2.Out"
    });

    if (this._justSetNewRecord) {
      this.flashCamera(100, 200, 200, 100);
      showFloatingText(this, GAME_WIDTH / 2, 210, "New score record!", theme.colors.semantic.text.score);
      this._justSetNewRecord = false;
    }
    if (this._justSetNewTimePb) {
      showFloatingText(this, GAME_WIDTH / 2, 246, "New survival record!", theme.colors.semantic.text.success);
      this._justSetNewTimePb = false;
    }
    this.showReplayButton();
  }

  showReplayButton() {
    this.replayButtonPanel = this.add
      .rectangle(GAME_WIDTH / 2, 540, 160, 100, parseInt(theme.colors.semantic.background.panel.replace("#", ""), 16), 0.92)
      .setStrokeStyle(theme.components.hud.stroke.width, parseInt(theme.colors.semantic.stroke.gameOver.replace("#", ""), 16), 0.75)
      .setDepth(theme.zIndex.banner);
    this.replayButtonPanel.setScale(0.88);
    this.tweens.add({
      targets: this.replayButtonPanel,
      scale: 1,
      duration: 320,
      ease: "Back.easeOut"
    });

    this.replayButton = this.add.sprite(GAME_WIDTH / 2, 518, "replay");
    this.replayButton.setScale(0);
    this.replayButton.setDepth(theme.zIndex.replayButton);
    // Large hit area for touch: 120x120 centered on icon
    this.replayButton.setInteractive(
      new Phaser.Geom.Rectangle(-60, -60, 120, 120),
      Phaser.Geom.Rectangle.Contains
    );
    this.replayButton.input.cursor = "pointer";

    this.tweens.add({
      targets: this.replayButton,
      scale: 0.22,
      duration: 350,
      delay: 80,
      ease: "Back.easeOut"
    });

    const playAgainText = this.add.text(GAME_WIDTH / 2, 562, "Play again", {
      fontSize: "28px",
      fill: theme.colors.semantic.text.warm,
      fontStyle: "bold",
      align: "center"
    });
    playAgainText.setOrigin(0.5, 0.5);
    playAgainText.setDepth(theme.zIndex.replayButton);
    playAgainText.setScale(0);
    playAgainText.setPadding(32, 16);
    playAgainText.setInteractive({ useHandCursor: true });
    playAgainText.on("pointerdown", () => this.resetRun());
    this.tweens.add({
      targets: playAgainText,
      scale: 1,
      duration: 280,
      delay: 120,
      ease: "Back.easeOut"
    });
    this.playAgainText = playAgainText;

    this.replayTween = this.tweens.add({
      targets: this.replayButton,
      ease: "Sine.easeInOut",
      duration: 2000,
      alpha: 0.18,
      repeat: -1,
      yoyo: true
    });

    // Pointer feedback: press and hover scale tweens (pulse tween only affects alpha)
    const REST_SCALE = 0.22;
    const HOVER_SCALE = 0.24;
    const PRESS_SCALE = 0.25;

    const stopReplayScaleTween = () => {
      if (this._replayScaleTween) {
        this._replayScaleTween.stop();
        this._replayScaleTween = null;
      }
    };

    this.replayButton.on("pointerdown", () => {
      stopReplayScaleTween();
      this._replayScaleTween = this.tweens.add({
        targets: this.replayButton,
        scale: PRESS_SCALE,
        duration: 50,
        ease: "Power2.easeOut"
      });
    });

    this.replayButton.on("pointerup", () => {
      stopReplayScaleTween();
      this._replayScaleTween = this.tweens.add({
        targets: this.replayButton,
        scale: REST_SCALE,
        duration: 80
      });
    });

    this.replayButton.on("pointerout", () => {
      stopReplayScaleTween();
      this._replayScaleTween = this.tweens.add({
        targets: this.replayButton,
        scale: REST_SCALE,
        duration: 80
      });
    });

    this.replayButton.on("pointerover", () => {
      stopReplayScaleTween();
      this._replayScaleTween = this.tweens.add({
        targets: this.replayButton,
        scale: HOVER_SCALE,
        duration: 60
      });
    });

    this.replayButton.on("pointerup", () => this.resetRun());

    const quitToMenuText = this.add.text(GAME_WIDTH / 2, 600, "Quit to menu", {
      fontSize: "24px",
      fill: theme.colors.semantic.text.warm,
      fontStyle: "bold",
      align: "center"
    });
    quitToMenuText.setOrigin(0.5, 0.5);
    quitToMenuText.setDepth(theme.zIndex.replayButton);
    quitToMenuText.setScale(0);
    quitToMenuText.setPadding(28, 14);
    quitToMenuText.setInteractive({ useHandCursor: true });
    this.tweens.add({
      targets: quitToMenuText,
      scale: 1,
      duration: 280,
      delay: 160,
      ease: "Back.easeOut"
    });
    quitToMenuText.on("pointerover", () => quitToMenuText.setScale(1.08));
    quitToMenuText.on("pointerout", () => quitToMenuText.setScale(1));
    quitToMenuText.on("pointerdown", () => this.exitAndSaveRun());
  }

  showPausePanel() {
    if (this.pausePanel) return;
    this.pauseButton?.setVisible(false);
    const panelTint = parseInt(theme.colors.semantic.background.panel.replace("#", ""), 16);
    this.pausePanel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 500, 400, panelTint, 0.95).setStrokeStyle(theme.components.hud.stroke.width, theme.colors.semantic.game.phaseCyan, 0.8).setDepth(theme.zIndex.pausePanel);
    const pausedText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 120, "Paused", { fontSize: "48px", fill: theme.colors.semantic.text.phase, fontStyle: "bold" }).setOrigin(0.5, 0.5).setDepth(theme.zIndex.pausePanel + 1);
    const resumeBtn = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 55, "Resume", { fontSize: "28px", fill: theme.colors.semantic.text.accent }).setOrigin(0.5, 0.5).setDepth(theme.zIndex.pausePanel + 1).setPadding(20, 12);
    const optionsBtn = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 5, "Options", { fontSize: "28px", fill: theme.colors.semantic.text.accent }).setOrigin(0.5, 0.5).setDepth(theme.zIndex.pausePanel + 1).setPadding(20, 12);
    const exitAndSaveBtn = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 65, "Exit and save", { fontSize: "28px", fill: theme.colors.semantic.text.warm }).setOrigin(0.5, 0.5).setDepth(theme.zIndex.pausePanel + 1).setPadding(20, 12);
    const quitNoSaveBtn = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 125, "Quit without saving", { fontSize: "24px", fill: theme.colors.semantic.text.muted }).setOrigin(0.5, 0.5).setDepth(theme.zIndex.pausePanel + 1).setPadding(20, 12);

    [resumeBtn, optionsBtn, exitAndSaveBtn, quitNoSaveBtn].forEach(btn => btn.setInteractive({ useHandCursor: true }));

    resumeBtn.on("pointerover", () => resumeBtn.setScale(1.1));
    resumeBtn.on("pointerout", () => resumeBtn.setScale(1));
    resumeBtn.on("pointerdown", () => this.resume());

    optionsBtn.on("pointerover", () => optionsBtn.setScale(1.1));
    optionsBtn.on("pointerout", () => optionsBtn.setScale(1));
    optionsBtn.on("pointerdown", () => {
      this.scene.start(SCENE_KEYS.options, { returnTo: SCENE_KEYS.game, returnData: { paused: true } });
    });

    exitAndSaveBtn.on("pointerover", () => exitAndSaveBtn.setScale(1.1));
    exitAndSaveBtn.on("pointerout", () => exitAndSaveBtn.setScale(1));
    exitAndSaveBtn.on("pointerdown", () => this.exitAndSaveRun());

    quitNoSaveBtn.on("pointerover", () => quitNoSaveBtn.setScale(1.1));
    quitNoSaveBtn.on("pointerout", () => quitNoSaveBtn.setScale(1));
    quitNoSaveBtn.on("pointerdown", () => this.scene.start(SCENE_KEYS.mainMenu));

    this._pausePanelChildren = [this.pausePanel, pausedText, resumeBtn, optionsBtn, exitAndSaveBtn, quitNoSaveBtn];
  }

  /** Save run as last completed level = current level - 1 (do not save ongoing level), then go to main menu. */
  exitAndSaveRun() {
    const score = this.getScore();
    this.flushRunTelemetry(true, score);
    const currentLevel = getCurrentLevelFromScore(score);
    const levelToSave = Math.max(0, currentLevel - 1);
    if (levelToSave > 0) {
      setLastCompletedLevel(Math.max(getLastCompletedLevel(), levelToSave));
    }
    this.claimCompletedContracts();
    this.stopAudio();
    this.scene.start(SCENE_KEYS.mainMenu);
  }

  flushRunTelemetry(exited, score = this.getScore()) {
    if (!this.currentRunId) {
      return;
    }

    emitRunEnd({
      runId: this.currentRunId,
      score,
      runTimeMs: this.runTimeMs,
      exited
    });
    this.currentRunId = null;
    uploadTelemetryBatch();
  }

  hidePausePanel() {
    if (this._pausePanelChildren) {
      this._pausePanelChildren.forEach(c => c.destroy());
      this._pausePanelChildren = null;
    }
    this.pausePanel = null;
    if (this.pauseButton && !this.gameOverState) {
      this.pauseButton.setVisible(true);
    }
  }

  pause() {
    this.paused = true;
    this.physics.pause();
    if (this.music) this.music.pause();
    setRichPresence("Paused");
    this.showPausePanel();
  }

  resume() {
    this.paused = false;
    this.hidePausePanel();
    this.physics.resume();
    if (this.music) this.music.resume();
    setRichPresence("In game");
  }

  update(_, delta) {
    if (this.escKey && Phaser.Input.Keyboard.JustDown(this.escKey) && this.gameOverState === false && !this.activeChallenge && !this.pendingPerkChoices && this._getReadyRemainingMs <= 0) {
      if (this.paused) {
        this.resume();
      } else {
        this.pause();
      }
      return;
    }
    if (this.paused) {
      return;
    }
    if (this.gameOverState === false) {
      if (this.activeChallenge || this.pendingPerkChoices) {
        this.updateChallengeState(delta);
        this.updateHud(this.spawnDirector.getContext(this.getScore()));
        return;
      }

      if (this._getReadyRemainingMs > 0) {
        this._getReadyRemainingMs = Math.max(0, this._getReadyRemainingMs - delta);
        this.updateHud(this.spawnDirector.getContext(this.getScore()));
        this.updateParallax(delta);
        this.updatePlayerMovement();
        this.clearOffscreenObjects();
        return;
      }

      this.runTimeMs += delta;
      this.noHitWindowMs += delta;
      const currentSecond = Math.floor(this.runTimeMs / 1000);
      if (currentSecond > this._lastScoreTickSecond) {
        const skipFirstTick = this._lastScoreTickSecond === -1 && currentSecond === 0;
        if (!skipFirstTick) {
          this.ooGnome.setVolume(0.12);
          this.ooGnome.setRate(1.6);
          this.ooGnome.play();
          if (this._dailyPassiveScorePerSec > 0) {
            this.bonusScore += this._dailyPassiveScorePerSec;
          }
        }
        this._lastScoreTickSecond = currentSecond;
      }
      this.damageRecoveryMs = Math.max(0, this.damageRecoveryMs - delta);
      this.objectiveDirector.recordSurvival(delta);
      this.recordContractEvent({ type: "survival", deltaMs: delta });

      this.tempSpeedBoostMs = Math.max(0, this.tempSpeedBoostMs - delta);
      this.tempInvulnMs = Math.max(0, this.tempInvulnMs - delta);
      if (this.tempScoreMultMs > 0) {
        this.tempScoreMultMs = Math.max(0, this.tempScoreMultMs - delta);
        this.bonusScore += (delta / 1000) * (this.tempScoreMultMultiplier - 1);
      }

      const score = this.getScore();
      const scoreFloor = Math.floor(score);
      if (scoreFloor > this._maxContractRunScore) {
        this._maxContractRunScore = scoreFloor;
        this.recordContractEvent({ type: "runScore", score: scoreFloor });
      }
      const { events, context } = this.spawnDirector.update(
        delta,
        score,
        Boolean(this.activeBoss)
      );
      const modeFilteredEvents = this.mode === GAME_MODES.BossRush
        ? events.filter(event => !isHazardDescriptor(event) || Math.random() <= this.modeConfig.fillerHazardSpawnChance || event.kind === "boss")
        : events;

      this.currentFallSpeed = context.fallSpeed;
      this.backgroundSpeed = context.backgroundSpeed * (this._dailyFallMult ?? 1);
      const toCelebrate = MILESTONES.find(
        m => score >= m && m > this._lastMilestoneCelebrated
      );
      if (toCelebrate != null) {
        this._lastMilestoneCelebrated = toCelebrate;
        this.emitParticleBurst(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, 8, 300, 0.3);
        showFloatingText(
          this,
          GAME_WIDTH / 2,
          GAME_HEIGHT / 2 - 80,
          toCelebrate + "!",
          theme.colors.semantic.text.score
        );
        SCORE_ACHIEVEMENT_MILESTONES.forEach(milestone => {
          if (toCelebrate >= milestone.score) {
            unlockAchievement(milestone.achievementId);
          }
        });
      }

      NO_HIT_WINDOWS_MS.forEach(window => {
        if (this.noHitWindowMs >= window.ms && this._lastNoHitAchievementMs < window.ms) {
          this._lastNoHitAchievementMs = window.ms;
          unlockAchievement(window.achievementId);
              showFloatingText(this, GAME_WIDTH / 2, 116, "No-hit " + Math.floor(window.ms / 1000) + "s!", theme.colors.semantic.text.success);
        }
      });
      this.handlePhaseChange(context);
      this.updateHud(context);
      this.updateParallax(delta);

      modeFilteredEvents.forEach(event => this.spawnFromDescriptor(event));

      this.updateMovingGroup(this.hazards, delta);
      this.updateMovingGroup(this.pickups, delta);
      this.updateProjectiles(delta);
      this.updateBoss(delta);
      this.updateDamageZones(delta);
      this.updatePlayerMovement();
      this.unlockExitIfNeeded(score);
      this.maybeStartChallenge(score, context.intensity);
      this.maybeForceDraftPerk();
      this.processObjectiveRewards();

      this._richPresenceThrottle = (this._richPresenceThrottle || 0) + delta;
      if (this._richPresenceThrottle > 3000) {
        this._richPresenceThrottle = 0;
        setRichPresence(`Score: ${Math.floor(score)}`);
      }

      if (this.exitUnlocked && this.player?.body?.blocked?.right) {
        this.cameras.main.fade(400, 0, 0, 0);
        this.cameras.main.once("camerafadeoutcomplete", () => {
          this.flushRunTelemetry(true, score);
          this.claimCompletedContracts();
          this.stopAudio();
          submitRunLeaderboards({
            runScore: this.highestScoreValue,
            survivalSeconds: Math.floor(this.runTimeMs / 1000)
          });
          this.scene.start(SCENE_KEYS.mainMenu);
        });
        return;
      }
    } else if (this.gameOverState === "ended") {
      if (
        (this.replayKeyR && Phaser.Input.Keyboard.JustDown(this.replayKeyR)) ||
        (this.replayKeySpace && Phaser.Input.Keyboard.JustDown(this.replayKeySpace))
      ) {
        this.resetRun();
        return;
      }
      this.player.setVelocity(0, 0);
      this.player.anims.play("flex", true);
    }

    this.clearOffscreenObjects();
  }

  recordContractEvent(event) {
    this.contracts = applyRunEventToContracts(this.contracts, event, {
      progressMultiplier: this._dailyContractProgressMult ?? 1
    });
  }

  claimCompletedContracts() {
    const active = this.contracts || [];
    updateContracts(() => active);
    this.lastContractClaims = [];
    active.forEach((contract) => {
      const reward = claimCompletedContract(contract.id);
      if (reward) {
        this.lastContractClaims.push({ title: contract.title, reward });
      }
    });
  }

  updatePlayerMovement() {
    const movingLeft = this.cursors.left.isDown || this.movementKeys.A.isDown;
    const movingRight = this.cursors.right.isDown || this.movementKeys.D.isDown;
    const movingUp = this.cursors.up.isDown || this.movementKeys.W.isDown;
    const movingDown = this.cursors.down.isDown || this.movementKeys.S.isDown;

    let velocityX = 0;
    let velocityY = 0;

    if (movingLeft) {
      velocityX -= 1;
    }
    if (movingRight) {
      velocityX += 1;
    }
    if (movingUp) {
      velocityY -= 1;
    }
    if (movingDown) {
      velocityY += 1;
    }

    if (velocityX !== 0 || velocityY !== 0) {
      const magnitude = Math.hypot(velocityX, velocityY) || 1;
      let liveSpeed = PLAYER_SPEED * this.runModifiers.moveSpeedMultiplier;
      if (this.tempSpeedBoostMs > 0) {
        liveSpeed *= 1.25;
      }
      velocityX = (velocityX / magnitude) * liveSpeed;
      velocityY = (velocityY / magnitude) * liveSpeed;
      this.player.setVelocity(velocityX, velocityY);

      if (velocityX < 0) {
        this.lastFacing = "left";
        this.player.anims.play("walkLeft", true);
      } else if (velocityX > 0) {
        this.lastFacing = "right";
        this.player.anims.play("walkRight", true);
      } else {
        this.player.anims.play(
          this.lastFacing === "left" ? "walkLeft" : "walkRight",
          true
        );
      }

      return;
    }

    this.player.setVelocity(0, 0);
    this.player.anims.play("flex", true);
  }

  handlePhaseChange(context) {
    if (this.phaseKey === context.phaseKey) {
      return;
    }

    this.phaseKey = context.phaseKey;

    const phaseMessages = {
      recovery: "Recovery phase. Wider gaps and more pickup windows.",
      push: "Push phase. The sky starts layering staggered drops.",
      heat: "Heat phase. Faster rain and miniboss chances unlock.",
      reset: "Reset phase. Pressure backs off before the next build."
    };

    this.setStatusText(phaseMessages[context.phaseKey], context.phaseColor);

    this.playEventSfx("sfxPhaseChange");
    const phaseColor = context.phaseColor ?? theme.colors.semantic.game.phaseCyan;
    const r = (phaseColor >> 16) & 0xff;
    const g = (phaseColor >> 8) & 0xff;
    const b = phaseColor & 0xff;
    this.flashCamera(120, r >> 1, g >> 1, b >> 1);
    this.emitParticleBurst(GAME_WIDTH / 2, GAME_HEIGHT / 2, 7, 250, 0.35);
    emitPhaseChangeBurst(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30);

    if (this._phasePowerupSprite) {
      this._phasePowerupSprite.destroy();
      this._phasePowerupSprite = null;
    }
    if (this.textures.exists("stagePowerup")) {
      this._phasePowerupSprite = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, "stagePowerup");
      this._phasePowerupSprite.setScale(0);
      this._phasePowerupSprite.setDepth(theme.zIndex.pausePanel - 1);
      this.tweens.add({
        targets: this._phasePowerupSprite,
        scale: 0.35,
        alpha: 0,
        duration: 600,
        ease: "Power2.Out",
        onComplete: () => {
          if (this._phasePowerupSprite?.scene) {
            this._phasePowerupSprite.destroy();
            this._phasePowerupSprite = null;
          }
        }
      });
    }
  }

  setStatusText(message, color = theme.colors.semantic.game.pickupShield) {
    this.statusText.setText(message);
    this.statusText.setColor(`#${color.toString(16).padStart(6, "0")}`);
    if (this._statusTextTween) this._statusTextTween.stop();
    this.statusText.setScale(0.96);
    this._statusTextTween = this.tweens.add({
      targets: this.statusText,
      scale: 1,
      duration: 80,
      ease: "Power2.Out",
      onComplete: () => {
        this._statusTextTween = null;
      }
    });
  }

  updateHud(context) {
    const displayScore = this.getDisplayScore();
    const phaseProgress = context.phaseProgress;
    const showHeat = context.phaseKey === "heat" || Boolean(this.activeBoss);

    if (phaseProgress < 0.85) {
      this.stopPhaseBarPulse();
    }

    if (this._lastHudScore != null && displayScore !== this._lastHudScore) {
      if (this._scoreTextTween) {
        this._scoreTextTween.stop();
      }
      this.scoreText.setScale(1.08);
      this._scoreTextTween = this.tweens.add({
        targets: this.scoreText,
        scale: 1,
        duration: 80,
        ease: "Power2.Out",
        onComplete: () => {
          this.scoreText.setScale(1);
          this._scoreTextTween = null;
        }
      });
    }
    this._lastHudScore = displayScore;
    this._lastHudPhaseProgress = phaseProgress;

    if (phaseProgress >= 0.85 && !this._phaseBarPulseTween) {
      this.phaseBarFill.setScale(1, 1);
      this._phaseBarPulseTween = this.tweens.add({
        targets: this.phaseBarFill,
        scaleY: 1.04,
        duration: 300,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
      });
    }

    this.scoreText.setText(`Survive · Score: ${displayScore}`);
    const timePb = getBestSurvivalSeconds(this.mode);
    this.highestScore.setText(
      `${this.modeConfig.label} Best score: ${this.highestScoreValue} · Best time: ${timePb > 0 ? `${timePb}s` : "—"}`
    );
    const phaseLabelDetail = showHeat ? `${context.phaseLabel} · pace up` : context.phaseLabel;
    this.phaseText.setText(`Heat / phase: ${phaseLabelDetail}`);
    this.phaseText.setColor(`#${context.phaseColor.toString(16).padStart(6, "0")}`);
    this.shieldText.setText(`Shields: ${this.shieldCharges}/${this.runModifiers.maxShields}`);
    if (!this.gameOverState && this.shieldCharges <= 1) {
      const warningColor = this.shieldCharges === 0 ? theme.colors.semantic.text.danger : theme.colors.semantic.text.bossTimer;
      if (this._lastShieldTextColor !== warningColor) {
        this.shieldText.setColor(warningColor);
        this._lastShieldTextColor = warningColor;
      }
      if (!this._shieldPulseTween) {
        this.shieldText.setScale(1);
        this._shieldPulseTween = this.tweens.add({
          targets: this.shieldText,
          scale: 1.06,
          duration: 400,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut"
        });
      }
    } else {
      if (this._lastShieldTextColor !== theme.colors.base.white) {
        this.shieldText.setColor(theme.colors.base.white);
        this._lastShieldTextColor = theme.colors.base.white;
      }
      if (this._shieldPulseTween) {
        this._shieldPulseTween.stop();
        this._shieldPulseTween = null;
      }
      this.shieldText.setScale(1);
    }
    if (this._lastPhaseBarColor !== context.phaseColor) {
      this.phaseBarFill.fillColor = context.phaseColor;
      this._lastPhaseBarColor = context.phaseColor;
    }

    if (this.heatIndicator && this._lastHeatIndicatorVisible !== showHeat) {
      this.heatIndicator.setVisible(showHeat);
      this._lastHeatIndicatorVisible = showHeat;
    }

    const phaseBarWidthTarget = Math.max(
      PHASE_BAR_MIN_WIDTH,
      Math.round(PHASE_BAR_WIDTH * context.phaseProgress)
    );
    if (phaseBarWidthTarget !== this._lastPhaseBarWidthTarget) {
      this.phaseBarFill.width = phaseBarWidthTarget;
      this._lastPhaseBarWidthTarget = phaseBarWidthTarget;
    }
  }

  createChallengeUi() {
    if (!this.textures.exists("challengePanelBg")) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(parseInt(theme.colors.semantic.background.overlay.replace("#", ""), 16), 0.95);
      g.fillRoundedRect(0, 0, 740, 330, 16);
      g.lineStyle(theme.components.hud.stroke.width, theme.colors.semantic.game.phaseCyan, 0.9);
      g.strokeRoundedRect(0, 0, 740, 330, 16);
      g.generateTexture("challengePanelBg", 740, 330);
      g.destroy();
    }
    const panelGlow = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 740 * 1.02, 330 * 1.02, theme.colors.semantic.game.phaseCyan, 0.15);
    const panelBg = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, "challengePanelBg");
    this.challengeInputKeys = this.input.keyboard.addKeys("ONE,TWO,THREE");
    this.challengeText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 104, "", {
      font: "700 34px Arial",
      fill: theme.colors.semantic.text.status,
      align: "center"
    });
    this.challengeText.setOrigin(0.5, 0.5);

    this.challengeTimerText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 34, "", {
      font: "700 24px Arial",
      fill: theme.colors.semantic.text.bossTimer,
      align: "center"
    });
    this.challengeTimerText.setOrigin(0.5, 0.5);

    this.challengeOptionTexts = [0, 1, 2].map(index => {
      const optionText = this.add.text(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2 + 30 + index * 54,
        "",
        { font: "700 28px Arial", fill: theme.colors.base.white, align: "center" }
      );
      optionText.setOrigin(0.5, 0.5);
      optionText.setPadding(24, 12);
      optionText.setInteractive({ useHandCursor: true });
      optionText.on("pointerdown", () => this._onChallengeOrPerkOptionSelected(index));
      return optionText;
    });

    this.perkOptionIcons = [0, 1, 2].map(index => {
      const icon = this.add.sprite(
        GAME_WIDTH / 2 - 280,
        GAME_HEIGHT / 2 + 30 + index * 54,
        "perkIcons",
        0
      );
      icon.setScale(1.2);
      icon.setVisible(false);
      // Large touch hit area: 72x72 centered (icon ~48px at 1.2 scale)
      icon.setInteractive(
        new Phaser.Geom.Rectangle(-36, -36, 72, 72),
        Phaser.Geom.Rectangle.Contains
      );
      icon.input.cursor = "pointer";
      icon.on("pointerdown", () => this._onChallengeOrPerkOptionSelected(index));
      return icon;
    });

    this.challengePanel = this.add.container(0, 0, [
      panelGlow,
      panelBg,
      this.challengeText,
      this.challengeTimerText,
      ...this.challengeOptionTexts,
      ...this.perkOptionIcons
    ]);
    this.challengePanel.setDepth(theme.zIndex.challengePanel);
    this.challengePanel.setVisible(false);
  }

  showChallengePanelTransitionIn() {
    if (this._challengePanelTween) {
      this._challengePanelTween.stop();
      this._challengePanelTween = null;
    }
    this.challengePanel.setAlpha(0);
    this.challengePanel.setScale(0.94);
    this.challengePanel.setVisible(true);
    this._challengePanelTween = this.tweens.add({
      targets: this.challengePanel,
      alpha: 1,
      scale: 1,
      duration: 220,
      ease: "Power2.Out",
      onComplete: () => {
        this._challengePanelTween = null;
      }
    });
  }

  hideChallengePanelTransitionOut(onComplete) {
    if (this._challengePanelTween) {
      this._challengePanelTween.stop();
      this._challengePanelTween = null;
    }
    this._challengePanelTween = this.tweens.add({
      targets: this.challengePanel,
      alpha: 0,
      scale: 0.94,
      duration: 180,
      ease: "Power2.In",
      onComplete: () => {
        this.challengePanel.setVisible(false);
        this.challengePanel.setAlpha(1);
        this.challengePanel.setScale(1);
        this._challengePanelTween = null;
        if (onComplete) onComplete();
      }
    });
  }

  maybeStartChallenge(score, intensity) {
    if (score < this.nextChallengeScore) {
      return;
    }

    const challenge = this.challengeDirector.maybeCreateChallenge(score, intensity);
    if (!challenge) {
      return;
    }

    this.nextChallengeScore += this.modeConfig.challengeScoreInterval;

    this.activeChallenge = challenge;
    this.challengeRemainingMs = challenge.durationMs;
    this.showChallengePanelTransitionIn();
    this.challengeText.setText(`${challenge.title}\n${challenge.prompt}`);
    this.challengeOptionTexts.forEach((entry, index) => {
      entry.setText(`${index + 1}. ${challenge.options[index]}`);
    });
    this.perkOptionIcons.forEach(icon => icon.setVisible(false));
    this.physics.pause();
    this.music.setVolume(0.25);
    this.setStatusText("Challenge break: answer before the timer expires.", theme.colors.semantic.game.phaseCyan);
  }

  maybeForceDraftPerk() {
    if (this.mode !== GAME_MODES.Draft || this.pendingPerkChoices || this.activeChallenge) {
      return;
    }
    if (this.runTimeMs < this.nextDraftPerkAtMs) {
      return;
    }

    const perkChoices = buildPerkChoices(this.ownedPerks);
    if (perkChoices.length === 0) {
      this.nextDraftPerkAtMs += this.modeConfig.draftPerkIntervalSeconds * 1000;
      return;
    }

    this.pendingPerkChoices = perkChoices;
    this.showChallengePanelTransitionIn();
    this.challengeText.setText("Draft pick");
    this.challengeTimerText.setText("Choose one now (1 / 2 / 3)");
    this.challengeOptionTexts.forEach((entry, index) => {
      const perk = perkChoices[index];
      entry.setText(perk ? `${index + 1}. ${perk.title} — ${perk.description}` : "");
    });
    this.perkOptionIcons.forEach((icon, index) => {
      const perk = perkChoices[index];
      if (perk && this.textures.exists("perkIcons")) {
        icon.setFrame(getPerkIconFrame(perk.id));
        icon.setVisible(true);
      } else {
        icon.setVisible(false);
      }
    });
    this.physics.pause();
    this.music.setVolume(0.25);
    this.setStatusText("Draft mode: mandatory perk selection.", theme.colors.semantic.game.pickupShield);
    this.nextDraftPerkAtMs += this.modeConfig.draftPerkIntervalSeconds * 1000;
  }

  updateChallengeState(delta) {
    if (this.pendingPerkChoices) {
      this.captureOptionInput(this.pendingPerkChoices, chosenPerk => {
        this.runModifiers = applyPerk(this.runModifiers, chosenPerk.id);
        this.ownedPerks.push(chosenPerk.id);
        this.recordContractEvent({ type: "perkTaken" });
        this.pendingPerkChoices = null;
        this.hideChallengePanelTransitionOut(() => {
          this.music.setVolume(DODGE_AUDIO.musicNormalVolume);
          this.physics.resume();
          this.setStatusText(`Perk online: ${chosenPerk.title}.`, theme.colors.semantic.game.phaseGreen);
          if (this.juice) this.juice.pulse(this.player);
        });
      });
      return;
    }

    if (!this.activeChallenge) {
      return;
    }

    this.challengeRemainingMs = Math.max(0, this.challengeRemainingMs - delta);
    const secondsLeft = (this.challengeRemainingMs / 1000).toFixed(1);
    this.challengeTimerText.setText(`Timer: ${secondsLeft}s (press 1 / 2 / 3)`);

    if (this.challengeRemainingMs <= 3000) {
      this.challengeTimerText.setColor(theme.colors.semantic.text.danger);
    } else {
      this.challengeTimerText.setColor(theme.colors.semantic.text.bossTimer);
    }

    if (this.challengeRemainingMs <= 5000 && !this._challengeUrgencyTweenActive) {
      this._challengeUrgencyTweenActive = true;
      this._challengeUrgencyTween = this.tweens.add({
        targets: this.challengeTimerText,
        scale: 1.08,
        duration: 200,
        yoyo: true,
        repeat: -1
      });
    }

    if (this.challengeRemainingMs <= 0) {
      this.resolveChallenge(-1);
      return;
    }

    this.captureOptionInput(this.activeChallenge.options, (_, index) => {
      this.resolveChallenge(index);
    });
  }

  stopChallengeUrgencyTween() {
    if (this._challengeUrgencyTween) {
      this._challengeUrgencyTween.stop();
      this._challengeUrgencyTween = null;
    }
    this._challengeUrgencyTweenActive = false;
    if (this.challengeTimerText) {
      this.challengeTimerText.setScale(1);
      this.challengeTimerText.setColor(theme.colors.semantic.text.bossTimer);
    }
  }

  stopPhaseBarPulse() {
    if (this._phaseBarPulseTween) {
      this._phaseBarPulseTween.stop();
      this._phaseBarPulseTween = null;
    }
    if (this.phaseBarFill) {
      this.phaseBarFill.setScale(1, 1);
    }
  }

  _onChallengeOrPerkOptionSelected(index) {
    if (this.pendingPerkChoices && index < this.pendingPerkChoices.length) {
      const chosenPerk = this.pendingPerkChoices[index];
      this.runModifiers = applyPerk(this.runModifiers, chosenPerk.id);
      this.ownedPerks.push(chosenPerk.id);
      this.recordContractEvent({ type: "perkTaken" });
      this.pendingPerkChoices = null;
      this.hideChallengePanelTransitionOut(() => {
        this.music.setVolume(DODGE_AUDIO.musicNormalVolume);
        this.physics.resume();
        this.setStatusText(`Perk online: ${chosenPerk.title}.`, theme.colors.semantic.game.phaseGreen);
        if (this.juice) this.juice.pulse(this.player);
      });
      return;
    }
    if (this.activeChallenge && index < this.activeChallenge.options.length) {
      this.resolveChallenge(index);
    }
  }

  captureOptionInput(options, onChoice) {
    const keyMap = [this.challengeInputKeys.ONE, this.challengeInputKeys.TWO, this.challengeInputKeys.THREE];
    for (let index = 0; index < options.length; index += 1) {
      if (Phaser.Input.Keyboard.JustDown(keyMap[index])) {
        onChoice(options[index], index);
        break;
      }
    }
  }

  resolveChallenge(selectedIndex) {
    this.stopChallengeUrgencyTween();

    const challengeSnapshot = this.activeChallenge;
    const challengeType = challengeSnapshot?.type ?? "unknown";
    const result = this.challengeDirector.evaluate(
      challengeSnapshot,
      selectedIndex,
      this.challengeRemainingMs
    );
    emitChallengePerformance({
      runId: this.currentRunId,
      challengeType,
      success: result.success,
      selectedIndex,
      remainingMs: this.challengeRemainingMs
    });

    this.activeChallenge = null;
    this.hideChallengePanelTransitionOut(() => {});

    if (!result.success) {
      this.challengeSuccessStreak = 0;
      this.shieldCharges = Math.max(0, this.shieldCharges - (result.reward.shieldPenalty ?? 0));
      this.challengeOutcomeLog.push(`${challengeSnapshot?.title || "Challenge"}: failed (${result.message})`);
      this.music.setVolume(DODGE_AUDIO.musicNormalVolume);
      this.physics.resume();
      this.setStatusText(result.message, parseInt(theme.colors.semantic.stroke.gameOver.replace("#", ""), 16));
      return;
    }

    this.playEventSfx("sfxChallengeComplete");
    this.challengeSuccessStreak += 1;
    CHALLENGE_STREAK_ACHIEVEMENTS.forEach(entry => {
      if (this.challengeSuccessStreak >= entry.streak) {
        unlockAchievement(entry.achievementId);
      }
    });
    showFloatingText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 140, "Correct!", theme.colors.semantic.text.success);
    this.emitParticleBurst(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 80, 6, 280, 0.3, theme.colors.semantic.game.phaseGreen);

    const challengeScore = Math.round(
      result.reward.scoreBonus * this.runModifiers.challengeScoreMultiplier
    );
    this.completedChallenges += 1;
    this.recordContractEvent({ type: "challengeSuccess" });
    this.bonusScore += challengeScore;
    this.runRewardTotals.score += challengeScore;
    if (challengeScore > 0) {
      showFloatingText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 100, `+${challengeScore}`, theme.colors.semantic.text.success);
    }
    this.shieldCharges = Math.min(
      this.runModifiers.maxShields,
      this.shieldCharges + result.reward.shieldBonus
    );
    this.runRewardTotals.shields += result.reward.shieldBonus || 0;
    this.perkPoints += result.reward.perkPoint;
    this.runRewardTotals.perkPoints += result.reward.perkPoint || 0;
    this.challengeOutcomeLog.push(`${challengeSnapshot?.title || "Challenge"}: success (${result.message})`);
    this.setStatusText(result.message, theme.colors.semantic.game.phaseGreen);

    if (this.perkPoints > 0) {
      this.perkPoints -= 1;
      const perkChoices = buildPerkChoices(this.ownedPerks);
      if (perkChoices.length > 0) {
        this.pendingPerkChoices = perkChoices;
        this.showChallengePanelTransitionIn();
        this.challengeText.setText("Pick a perk");
        this.challengeTimerText.setText("Press 1 / 2 / 3");
        this.challengeOptionTexts.forEach((entry, index) => {
          const perk = perkChoices[index];
          entry.setText(perk ? `${index + 1}. ${perk.title} — ${perk.description}` : "");
        });
        this.perkOptionIcons.forEach((icon, index) => {
          const perk = perkChoices[index];
          if (perk && this.textures.exists("perkIcons")) {
            const frameIndex = getPerkIconFrame(perk.id);
            icon.setFrame(frameIndex);
            icon.setVisible(true);
          } else {
            icon.setVisible(false);
          }
        });
        return;
      }
    }

    this.music.setVolume(DODGE_AUDIO.musicNormalVolume);
    this.physics.resume();
  }


  processObjectiveRewards() {
    const completed = this.objectiveDirector.consumeCompletedRewards();
    if (completed.length === 0) {
      this.renderObjectives();
      return;
    }

    this.playEventSfx("sfxObjectiveComplete");
    completed.forEach(objective => {
      this.bonusScore += objective.reward.scoreBonus;
      this.runRewardTotals.score += objective.reward.scoreBonus || 0;
      if (objective.reward.scoreBonus > 0) {
        showFloatingText(this, GAME_WIDTH / 2, 160, `+${objective.reward.scoreBonus}`, theme.colors.semantic.text.success);
      }
      this.shieldCharges = Math.min(
        this.runModifiers.maxShields,
        this.shieldCharges + objective.reward.shieldBonus
      );
      this.runRewardTotals.shields += objective.reward.shieldBonus || 0;
      this.perkPoints += objective.reward.perkPoint;
      this.runRewardTotals.perkPoints += objective.reward.perkPoint || 0;
      this.objectiveOutcomeLog.push(`${objective.title}: complete`);
      this.setStatusText(`Objective complete: ${objective.title}`, theme.colors.semantic.game.phaseGreen);
    });

    this.flashCamera(120, 100, 200, 255);
    this.emitParticleBurst(this.player.x, this.player.y, 8, 300, 0.3);
    if (this._objectivePulseTween) {
      this._objectivePulseTween.stop();
      this._objectivePulseTween = null;
    }
    if (this.objectiveText) {
      this.objectiveText.setScale(1.02);
      this._objectivePulseTween = this.tweens.add({
        targets: this.objectiveText,
        scale: 1,
        duration: 120,
        ease: "Power2.easeOut",
        onComplete: () => {
          this._objectivePulseTween = null;
        }
      });
    }
    this.renderObjectives();
  }

  renderObjectives() {
    if (!this.objectiveText) {
      return;
    }

    const lines = this.objectiveDirector.getObjectives().map(objective => {
      const done = objective.claimed ? "✓" : objective.completed ? "★" : "•";
      const progress = objective.id === "survivor"
        ? `${Math.floor(objective.progress / 1000)}s/${Math.floor(objective.target / 1000)}s`
        : `${objective.progress}/${objective.target}`;
      return `${done} ${objective.title}: ${progress}`;
    });

    this.objectiveText.setText(["Objectives", ...lines].join("\n"));
  }

  updateParallax(delta) {
    if (!this.backgroundLayer) {
      return;
    }

    this.backgroundLayer.tilePositionY +=
      (this.backgroundSpeed * delta) / 1000;
  }

  unlockExitIfNeeded(score) {
    if (this.exitUnlocked || score < EXIT_UNLOCK_SCORE) {
      return;
    }

    this.exitUnlocked = true;
    this.setStatusText(
      "Exit unlocked. Dash to the right edge whenever you want to leave the dodge loop.",
      theme.colors.semantic.game.phaseGreen
    );
    this.exitText.setText("Exit unlocked: touch the right wall to continue");

    this.flashCamera(120, 100, 255, 150);
    this.emitParticleBurst(GAME_WIDTH - 80, GAME_HEIGHT / 2, 7, 250, 0.35);

    this.exitText.setAlpha(0.85);
    this._exitTextPulseTween = this.tweens.add({
      targets: this.exitText,
      alpha: 1,
      duration: 600,
      repeat: -1,
      yoyo: true,
      ease: "Sine.easeInOut"
    });
  }

  spawnFromDescriptor(descriptor) {
    if (descriptor.kind === "boss") {
      this.spawnMiniBoss(descriptor);
      return;
    }

    if (descriptor.kind === "pickup") {
      this.spawnPickup(descriptor);
      return;
    }

    this.spawnHazard(descriptor);
  }

  spawnHazard(descriptor) {
    const texture =
      descriptor.proceduralParams != null
        ? ensureProceduralTexture(this, descriptor.proceduralParams)
        : descriptor.texture;
    if (!texture) return;
    const hazard = this.physics.add.image(descriptor.x, descriptor.y, texture);
    hazard.setScale(descriptor.scaleX ?? HAZARD_VISUAL_DEFAULTS.scale, descriptor.scaleY ?? HAZARD_VISUAL_DEFAULTS.scale);
    hazard.setDepth(theme.zIndex.gameplay);
    hazard.setTint(this.mapHazardTint(descriptor.tint ?? HAZARD_VISUAL_DEFAULTS.tint));
    hazard.setAlpha(descriptor.alpha ?? 1);
    hazard.body.setAllowGravity(false);
    hazard.setImmovable(true);
    const vx = descriptor.velocityX ?? 0;
    const vy = descriptor.velocityY ?? descriptor.speed;
    hazard.setVelocity(vx, vy);
    hazard.setDataEnabled();
    hazard.setData("speed", descriptor.speed);
    hazard.setData("velocityX", vx);
    hazard.setData("velocityY", vy);
    hazard.setData("baseX", descriptor.x);
    hazard.setData("baseY", descriptor.y);
    hazard.setData("ageMs", 0);
    hazard.setData("rotationSpeed", descriptor.rotationSpeed ?? 0);
    hazard.setData("motion", descriptor.motion ?? { type: "none" });
    hazard.setData("destroyArchetype", descriptor.destroyArchetype ?? "clean");
    hazard.setData("type", descriptor.type);
    hazard.setData("debris", descriptor.debris ?? false);
    hazard.setData("graceFrames", descriptor.graceFrames ?? 0);
    hazard.setData("splitCount", descriptor.splitCount);
    hazard.setData("debrisCount", descriptor.debrisCount);
    hazard.setData("sourceKey", descriptor.obstacleKey || descriptor.kind || "hazard");
    hazard.setData("sourceName", descriptor.obstacleLabel || descriptor.obstacleKey || "Hazard");
    this.applyHitbox(hazard, descriptor.hitbox);
    this.hazards.add(hazard);

    const finalScaleX = descriptor.scaleX ?? HAZARD_VISUAL_DEFAULTS.scale;
    const finalScaleY = descriptor.scaleY ?? HAZARD_VISUAL_DEFAULTS.scale;
    hazard.setScale(0);
    this.tweens.add({
      targets: hazard,
      scaleX: finalScaleX,
      scaleY: finalScaleY,
      duration: 100,
      ease: "Power2.Out"
    });
  }

  spawnPickup(descriptor) {
    const frame = descriptor.pickupFrame;
    const useSprite = descriptor.texture === "pickupPowerups" && frame !== undefined;
    const pickup = useSprite
      ? this.physics.add.sprite(descriptor.x, descriptor.y, descriptor.texture, frame)
      : this.physics.add.image(descriptor.x, descriptor.y, descriptor.texture);
    pickup.setScale(descriptor.scaleX ?? 1, descriptor.scaleY ?? 1);
    pickup.setTint(descriptor.tint ?? theme.colors.semantic.game.hazardDefault);
    pickup.setDepth(theme.zIndex.pickups);
    pickup.body.setAllowGravity(false);
    pickup.setImmovable(true);
    const vx = descriptor.velocityX ?? 0;
    const vy = descriptor.velocityY ?? descriptor.speed;
    pickup.setVelocity(vx, vy);
    pickup.setDataEnabled();
    pickup.setData("speed", descriptor.speed);
    pickup.setData("velocityX", vx);
    pickup.setData("velocityY", vy);
    pickup.setData("baseX", descriptor.x);
    pickup.setData("baseY", descriptor.y);
    pickup.setData("ageMs", 0);
    pickup.setData("rotationSpeed", descriptor.rotationSpeed ?? 0);
    pickup.setData("motion", descriptor.motion ?? { type: "none" });
    this.applyHitbox(pickup, descriptor.hitbox);
    pickup.setData("pickupType", descriptor.pickupType ?? "shield");
    this.pickups.add(pickup);

    const PICKUP_ARRIVAL_TINTS = {
      shield: theme.colors.semantic.game.pickupShield,
      speed: theme.colors.semantic.game.pickupSpeed,
      invuln: theme.colors.semantic.game.pickupInvuln,
      scoreMult: theme.colors.semantic.game.pickupScoreMult,
      gambit: 0xffc933
    };
    this.emitParticleBurst(descriptor.x, descriptor.y, 5, 200, 0.25, PICKUP_ARRIVAL_TINTS[descriptor.pickupType ?? "shield"]);

    const finalScaleX = descriptor.scaleX ?? PICKUP_VISUAL_DEFAULTS.scale;
    const finalScaleY = descriptor.scaleY ?? PICKUP_VISUAL_DEFAULTS.scale;
    pickup.setScale(0);
    this.tweens.add({
      targets: pickup,
      scaleX: finalScaleX,
      scaleY: finalScaleY,
      duration: 100,
      ease: "Power2.Out"
    });
  }

  spawnMiniBoss(descriptor) {
    if (this.activeBoss) {
      return;
    }

    const texture =
      descriptor.proceduralParams != null
        ? ensureProceduralTexture(this, descriptor.proceduralParams)
        : descriptor.texture;
    if (!texture) return;

    const boss = this.physics.add.image(descriptor.x, descriptor.y, texture);
    boss.setScale(descriptor.scaleX ?? 1, descriptor.scaleY ?? 1);
    boss.setDepth(theme.zIndex.gameplay + 1);
    boss.setTint(this.mapHazardTint(descriptor.tint ?? theme.colors.semantic.game.hazardDefault));
    boss.body.setAllowGravity(false);
    boss.setImmovable(true);
    boss.setDataEnabled();
    boss.setData("persistent", true);
    boss.setData("config", descriptor);
    boss.setData("state", "enter");
    boss.setData("attackElapsedMs", 0);
    boss.setData("pendingTelegraphMs", 0);
    boss.setData("lifeMs", 0);
    boss.setData("phase", 1);
    boss.setData("phaseShifted", false);
    boss.setData("rotationSpeed", 36);
    boss.setVelocity(0, descriptor.entrySpeed);
    this.applyHitbox(boss, descriptor.hitbox);
    this.bossGroup.add(boss);
    this.activeBoss = boss;
    const archetype = descriptor.name || "Unknown";
    const isNewArchetype = !this.runArchetypes.has(archetype);
    this.runArchetypes.add(archetype);
    this.recordContractEvent({ type: "archetypeUsed", archetype, isNewArchetype });

    emitBossOutcome({
      runId: this.currentRunId,
      bossName: descriptor.name ?? "mini-boss",
      outcome: "spawned"
    });
    this.setStatusText(`${descriptor.name} inbound. Dodge the storm pattern.`, parseInt(theme.colors.semantic.stroke.gameOver.replace("#", ""), 16));
    this.shakeCamera(250, 0.006);
    cameraZoomPulse(this, 1.03, 220);
    this.flashCamera(180, 255, 110, 110);
    this.emitParticleBurst(descriptor.x, descriptor.y, 20, 400, 0.3, theme.colors.semantic.game.phaseRed);
    if (!this.activeChallenge && !this.pendingPerkChoices && this.music?.isPlaying) {
      this.tweens.add({
        targets: this.music,
        volume: DODGE_AUDIO.musicBossVolume,
        duration: 400,
        ease: "Power2.Out"
      });
    }
    this.ooGnome.setRate(0.5);
    this.ooGnome.play();
  }

  applyHitbox(sprite, hitbox = {}) {
    const scaleX = sprite.scaleX;
    const scaleY = sprite.scaleY;

    if (hitbox.shape === "circle") {
      const radius = hitbox.radius * Math.max(scaleX, scaleY);
      sprite.body.setCircle(radius);
      sprite.body.setOffset(
        (sprite.displayWidth - radius * 2) / 2 + (hitbox.offsetX ?? 0) * scaleX,
        (sprite.displayHeight - radius * 2) / 2 + (hitbox.offsetY ?? 0) * scaleY
      );
      sprite.body.updateFromGameObject();
      return;
    }

    const width = (hitbox.width ?? sprite.displayWidth) * scaleX;
    const height = (hitbox.height ?? sprite.displayHeight) * scaleY;
    const offsetX =
      hitbox.offsetX !== undefined
        ? hitbox.offsetX * scaleX
        : (sprite.displayWidth - width) / 2;
    const offsetY =
      hitbox.offsetY !== undefined
        ? hitbox.offsetY * scaleY
        : (sprite.displayHeight - height) / 2;

    sprite.body.setSize(width, height);
    sprite.body.setOffset(offsetX, offsetY);
    sprite.body.updateFromGameObject();
  }

  updateMovingGroup(group, delta) {
    const deltaSeconds = delta / 1000;

    group.children.each(entry => {
      if (!entry?.body) {
        return;
      }

      const ageMs = entry.getData("ageMs") + delta;
      const motion = entry.getData("motion") ?? { type: "none" };
      const rotationSpeed = entry.getData("rotationSpeed") ?? 0;
      const vx = entry.getData("velocityX") ?? 0;
      const vy = entry.getData("velocityY") ?? entry.getData("speed");

      entry.setData("ageMs", ageMs);
      entry.setVelocity(vx, vy);

      if (motion.type === "sway" && vx === 0) {
        const phaseOffset = motion.phaseOffset ?? 0;
        entry.x =
          entry.getData("baseX") +
          Math.sin((ageMs / 1000) * motion.frequency + phaseOffset) *
            motion.amplitude;
        entry.body.updateFromGameObject();
      }

      if (rotationSpeed !== 0) {
        entry.angle += rotationSpeed * deltaSeconds;
      }

      if (entry.getData("debris")) {
        const gf = entry.getData("graceFrames") ?? 0;
        const next = Math.max(0, gf - 1);
        entry.setData("graceFrames", next);
        if (gf === 1 && next === 0 && this.player?.body) {
          const dx = this.player.x - entry.x;
          const dy = this.player.y - entry.y;
          if (dx * dx + dy * dy <= NEAR_MISS_DISTANCE * NEAR_MISS_DISTANCE) {
            showFloatingText(this, entry.x, entry.y - 20, "CLOSE!", theme.colors.semantic.text.danger);
          }
        }
      }
    });
  }

  updateProjectiles(delta) {
    const deltaSeconds = delta / 1000;

    this.projectiles.children.each(projectile => {
      if (!projectile?.body) {
        return;
      }

      projectile.angle += (projectile.getData("rotationSpeed") ?? 360) * deltaSeconds;
    });
  }

  updateBoss(delta) {
    if (!this.activeBoss?.body) {
      this.bossTimerText?.setVisible(false);
      return;
    }

    const boss = this.activeBoss;
    const config = boss.getData("config");
    const state = boss.getData("state");
    const durationMs = config?.durationMs ?? 0;
    const rotationSpeed = boss.getData("rotationSpeed");

    if (state === "enter" || state === "fight") {
      this.bossTimerText.setVisible(true);
      this.bossTimerText.setPosition(912, 200);
      if (state === "enter") {
        this.bossTimerText.setText("Boss: incoming");
      }
    } else if (state === "exit") {
      this.bossTimerText?.setVisible(false);
    }

    boss.angle += rotationSpeed * (delta / 1000);

    if (state === "enter") {
      boss.setVelocity(0, config.entrySpeed);

      if (boss.y >= config.holdY) {
        boss.y = config.holdY;
        boss.body.updateFromGameObject();
        boss.setVelocity(0, 0);
        boss.setData("state", "fight");
      }

      return;
    }

    const lifeMs = boss.getData("lifeMs") + delta;
    const attackElapsedMs = boss.getData("attackElapsedMs") + delta;
    const pendingTelegraphBefore = boss.getData("pendingTelegraphMs") ?? 0;
    const pendingTelegraphMs = Math.max(0, pendingTelegraphBefore - delta);
    boss.setData("lifeMs", lifeMs);
    boss.setData("attackElapsedMs", attackElapsedMs);
    boss.setData("pendingTelegraphMs", pendingTelegraphMs);

    if (shouldEnterPhaseTwo(config, lifeMs, boss.getData("phaseShifted") === true)) {
      boss.setData("phase", 2);
      boss.setData("phaseShifted", true);
      boss.setData("attackElapsedMs", config.attackCadenceMs);
      cameraZoomPulse(this, 1.055, 220);
      cameraShake(this, 140, 0.0032);
      this.setStatusText(`${config.name} phase shift! Attacks are accelerating.`, theme.colors.semantic.text.warm);
      showFloatingText(this, boss.x, boss.y - 60, "PHASE 2", theme.colors.semantic.text.warm);
    }

    if (state === "fight") {
      const remainingSeconds = Math.ceil((durationMs - lifeMs) / 1000);
      this.bossTimerText.setText("Boss: " + remainingSeconds + "s");
    }

    boss.x =
      config.holdX +
      Math.sin((lifeMs / 1000) * config.driftFrequency) * config.driftAmplitude;
    boss.y = config.holdY + Math.sin((lifeMs / 1000) * 2.2) * 14;
    boss.body.updateFromGameObject();

    const attackProfile = getBossAttackProfile(config, boss.getData("phase") ?? 1);
    const canAttack = state === "fight" && pendingTelegraphMs <= 0;
    if (canAttack && attackElapsedMs >= attackProfile.cadenceMs) {
      boss.setData("attackElapsedMs", 0);
      boss.setData("pendingTelegraphMs", attackProfile.telegraphMs);
      emitBossTelegraph(this, boss.x, boss.y + 52, attackProfile.signature);
      playBossTelegraphSfx(this, attackProfile.signature);
    } else if (state === "fight" && pendingTelegraphBefore > 0 && pendingTelegraphMs <= 0) {
      this.spawnBossVolley(boss, config, attackProfile);
    }

    if (state === "fight" && lifeMs >= config.durationMs) {
      this.bossClearsThisRun += 1;
      BOSS_CLEAR_ACHIEVEMENTS.forEach(entry => {
        if (this.bossClearsThisRun >= entry.clears) {
          unlockAchievement(entry.achievementId);
        }
      });
      boss.setData("state", "exit");
      this.bossTimerText?.setVisible(false);
      this.shakeCamera(200, 0.005);
      this.emitParticleBurst(boss.x, boss.y, 16, 350, 0.4, theme.colors.semantic.game.phaseGreen);
      boss.setVelocity(0, -config.exitSpeed);
      this.setStatusText("Boss wave cleared. One reward pocket before the next cycle.", theme.colors.semantic.game.phaseGreen);
      const reward = rollBossReward({ rng: this.spawnDirector.random });
      this.applyBossReward(reward, config.rewardPickup);
      emitBossOutcome({
        runId: this.currentRunId,
        bossName: config.name ?? "mini-boss",
        outcome: "cleared",
        durationMs: lifeMs
      });
      this.objectiveDirector.recordBossClear();
      this.bossClears += 1;
      this.recordContractEvent({ type: "bossClear" });
      this.processObjectiveRewards();
      return;
    }

    if (boss.getData("state") === "exit" && boss.y < -220) {
      if (!this.activeChallenge && !this.pendingPerkChoices && this.music?.isPlaying) {
        this.tweens.add({
          targets: this.music,
          volume: DODGE_AUDIO.musicNormalVolume,
          duration: 400,
          ease: "Power2.Out"
        });
      }
      boss.destroy();
      this.activeBoss = null;
    }
  }

  spawnBossVolley(boss, config, profile = null) {
    const attackProfile = profile ?? getBossAttackProfile(config, boss.getData("phase") ?? 1);
    const count = attackProfile.projectileCount;
    const boltParams = {
      family: "bolt",
      seed: (boss.y + this.runTimeMs) * 1e3,
      size: 38
    };
    const boltTexture = ensureProceduralTexture(this, boltParams) || "proc-bolt-0";

    for (let index = 0; index < count; index += 1) {
      const normalized = count === 1 ? 0 : index / (count - 1) - 0.5;
      const projectile = this.physics.add.image(
        boss.x + normalized * attackProfile.projectileSpread,
        boss.y + 66,
        boltTexture
      );
      const speedY = config.projectileSpeed;
      const travelTime = Math.max(0.7, (GAME_HEIGHT - projectile.y) / speedY);
      let speedX = 0;
      if (attackProfile.signature === "cross") {
        speedX = normalized * 180;
      } else {
        const targetX = this.player.x + normalized * 90;
        speedX = (targetX - projectile.x) / travelTime;
      }

      projectile.setTint(this.mapHazardTint(theme.colors.semantic.game.phaseAmber));
      projectile.setDepth(theme.zIndex.gameplay);
      projectile.body.setAllowGravity(false);
      projectile.setImmovable(true);
      projectile.setVelocity(speedX, speedY);
      projectile.setDataEnabled();
      projectile.setData("sourceKey", "boss-projectile");
      projectile.setData("sourceName", "Boss projectile");
      projectile.setData("rotationSpeed", 420);
      this.applyHitbox(projectile, {
        shape: "circle",
        radius: 12
      });
      this.projectiles.add(projectile);
    }
    this.emitParticleBurst(boss.x, boss.y + 66, 6, 240, 0.3, theme.colors.semantic.game.phaseAmber);
  }

  applyBossReward(reward, basePickup) {
    if (!reward) return;
    if (reward.kind === "metaFragment") {
      addMetaFragments(reward.fragments);
      this.bonusScore += reward.fragments;
      showFloatingText(this, GAME_WIDTH / 2, 186, `+${reward.fragments} Fragment`, theme.colors.semantic.text.objective);
      this.setStatusText(`Boss reward: ${reward.label} secured.`, theme.colors.semantic.game.pickupShield);
      emitObjectiveCompleteBurst(this, GAME_WIDTH / 2, 188);
      return;
    }

    const rewardPickup = buildBossRewardPickup(basePickup, reward);
    if (rewardPickup) {
      this.spawnPickup(rewardPickup);
      this.setStatusText(`Boss reward: ${reward.label}. Grab the relic!`, theme.colors.semantic.game.phaseGreen);
    }
  }

  clearOffscreenObjects() {
    if (this.hazards.count > MAX_HAZARDS) {
      const children = this.hazards.getChildren().slice();
      children.sort((a, b) => (a.getData("ageMs") ?? 0) - (b.getData("ageMs") ?? 0));
      const toRemove = children.slice(0, this.hazards.count - MAX_HAZARDS);
      toRemove.forEach(h => {
        if (h.scene) {
          this.hazards.remove(h);
          h.destroy();
        }
      });
    }

    const destroyIfOffscreen = entry => {
      if (
        entry &&
        (entry.x < -220 ||
          entry.x > GAME_WIDTH + 220 ||
          entry.y < -240 ||
          entry.y > GAME_HEIGHT + 220)
      ) {
        if (entry === this.activeBoss) {
          this.activeBoss = null;
        }

        entry.destroy();
      }
    };

    this.hazards.children.each(destroyIfOffscreen);
    this.pickups.children.each(destroyIfOffscreen);
    this.projectiles.children.each(destroyIfOffscreen);
    this.bossGroup.children.each(destroyIfOffscreen);
  }
}
