// Metadata inputs for this repository - unique to skyfall.
//
// Everything here is curated by hand: identity, commands, the screenshot recipe
// (capture), the recorded trailer (trailers.items, kind: capture) and where the
// card, icons and trailers are published. scripts/generate-project-meta.mjs
// derives the rest into project.meta.json; scripts/project-media.test.mjs
// checks that everything here was actually produced.
//   npm run meta:refresh   trailers -> shots -> social -> icons -> meta
//   npm run test:media     the media contract

import path from 'node:path';

const portfolioRoot = process.env.PORTFOLIO_ROOT ?? String.raw`C:\Users\Gaming PC\Desktop\Repos\portfolio`;

export default {
  "slug": "skyfall",
  "classification": "web-app",
  "curated": {
    "title": "Skyfall",
    "subtitle": "An endless dodger with heat, bosses and perk drafts",
    "description": "A Phaser 3 endless dodger: survive escalating waves as the heat rises, break boss encounters, draft perks between runs, and chase daily contracts, achievements and meta progression, with motion, flash and control options for accessibility. Vite in the browser, Electron on the desktop.",
    "tags": [
      "Game",
      "Phaser",
      "Arcade",
      "Electron",
      "Accessibility"
    ],
    "accent": "#ef4444",
    "deploymentUrl": "https://skyfall-git.pages.dev/",
    "localUrl": "http://127.0.0.1:4104/",
    "buildCommand": "npm run build",
    "buildOutput": "dist",
    "runCommand": "npm run dev -- --host 127.0.0.1 --port 4104",
    "devPort": 4104,
    "showcaseTier": "more"
  },
  "capture": {
    "route": "/",
    "readySelector": "canvas",
    "readyState": "visible",
    "waitAfterReadyMs": 3500
  },
  "scores": {
    "priorityScore": 76,
    "demoabilityScore": 92,
    "depthScore": 88,
    "polishScore": 86,
    "uniquenessScore": 86,
    "maintenanceScore": 82
  },
  "analysisNotes": "Current canonical Phaser arcade game with Vite build, Electron packaging, tests, and a strong immediate gameplay demo.",
  "social": {
    "htmlFile": "index.html",
    "pageTitle": "Skyfall",
    "staticDir": "public",
    "imageName": "og-image.jpg",
    "imageUrlPath": "/og-image.jpg"
  },
  "icons": {
    "background": "#0b1a3a",
    "themeColor": "#0b1a3a",
    "shortName": "Skyfall"
  },
  "media": {
    "sourceDir": path.join(portfolioRoot, "public", "project-shots", "skyfall", "latest"),
    "publicPathPrefix": "/project-shots/skyfall/latest",
    "primaryProfile": "card"
  },
  "trailers": {
    "items": [
      {
        "id": "tour",
        "title": "Skyfall: the menu and the drop",
        "kind": "capture",
        "inputs": [
          "app",
          "index.html",
          "style.css"
        ],
        "source": "deployment",
        "music": "project-media/music/tour.m4a",
        "posterAt": 0.5,
        "recipe": {
          "route": "/",
          "viewport": {
            "width": 1280,
            "height": 720
          },
          "durationMs": 20000,
          "setup": {
            "readySelector": "canvas",
            "readyState": "visible",
            "waitAfterReadyMs": 3000,
            "actions": [
              {
                "type": "click",
                "target": {
                  "selector": "canvas"
                },
                "label": "focus the game",
                "optional": true
              }
            ]
          },
          "timeline": [
            {
              "type": "press",
              "key": "Escape",
              "label": "skip the tutorial prompt"
            },
            {
              "type": "wait",
              "ms": 1200
            },
            {
              "type": "mouse",
              "to": [
                0.17,
                0.485
              ],
              "steps": 30,
              "label": "over Play"
            },
            {
              "type": "press",
              "key": "Space",
              "label": "start"
            },
            {
              "type": "wait",
              "ms": 3000
            },
            {
              "type": "key",
              "key": "ArrowLeft",
              "holdMs": 1400,
              "label": "dodge left"
            },
            {
              "type": "key",
              "key": "ArrowRight",
              "holdMs": 1600,
              "label": "dodge right"
            },
            {
              "type": "key",
              "key": "ArrowLeft",
              "holdMs": 900,
              "label": "dodge left"
            },
            {
              "type": "wait",
              "ms": 3000
            },
            {
              "type": "key",
              "key": "ArrowRight",
              "holdMs": 1200,
              "label": "dodge right"
            }
          ]
        }
      }
    ]
  }
};
