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
    "description": "Survive the drop and reach the exit in Classic, Boss Rush or Draft. Keep the original skeleton character and procedural arena, choose a loadout, chase daily contracts, and spend earned rewards. Responsive menus and readable touch run controls complement the keyboard game.",
    "tags": [
      "Game",
      "Phaser",
      "Arcade",
      "Electron",
      "Accessibility"
    ],
    "accent": "#ef4444",
    "deploymentUrl": "https://skyfall-git.pages.dev/",
    "localUrl": "http://127.0.0.1:4513/",
    "buildCommand": "npm run build",
    "buildOutput": "dist",
    "runCommand": "node scripts/serve-demo.cjs dist 4513",
    "devPort": 4513,
    "showcaseTier": "more"
  },
  "capture": {
    "browserArgs": ["--disable-webgl"],
    "route": "/",
    "readySelector": ".sky-menu",
    "readyState": "attached",
    "actions": [
        {
            "type": "wait",
            "ms": 800
        },
        {
            "type": "press",
            "key": "Space",
            "label": "Open the first-run controls guide"
        },
        {
            "type": "wait",
            "ms": 350
        },
        {
            "type": "press",
            "key": "Enter",
            "label": "Start the guided run"
        }
    ],
    "waitAfterReadyMs": 5000
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
        "source": "local",
        "music": "project-media/music/tour.m4a",
        "posterAt": 0.5,
        "recipe": {
        "browserArgs": ["--disable-webgl"],
        "route": "/",
        "viewport": {
                "width": 1280,
                "height": 720
        },
        "durationMs": 20000,
        "setup": {
                "readySelector": ".sky-menu",
    "readyState": "attached",
                "actions": [
                        {
                                "type": "wait",
                                "ms": 800
                        },
                        {
                                "type": "press",
                                "key": "Space",
                                "label": "Open the first-run controls guide"
                        },
                        {
                                "type": "wait",
                                "ms": 350
                        },
                        {
                                "type": "press",
                                "key": "Enter",
                                "label": "Start the guided run"
                        }
                ],
                "waitAfterReadyMs": 5000
        },
        "timeline": [
                {
                        "type": "key",
                        "key": "ArrowLeft",
                        "holdMs": 900
                },
                {
                        "type": "key",
                        "key": "ArrowRight",
                        "holdMs": 1400
                },
                {
                        "type": "key",
                        "key": "ArrowLeft",
                        "holdMs": 800
                },
                {
                        "type": "key",
                        "key": "ArrowRight",
                        "holdMs": 900
                }
        ]
}
      }
    ]
  }
};
