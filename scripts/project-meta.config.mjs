// Metadata inputs for this repository - unique to skyfall.
//
// Everything here is curated by hand. Derived facts (stack, metrics, git,
// screenshots) are computed by scripts/generate-project-meta.mjs, which writes
// project.meta.json. Run it with:
//   npm run meta          regenerate project.meta.json
//   npm run meta:check    fail if project.meta.json is stale

import path from 'node:path';

// Screenshots are captured by the portfolio (npm run capture there). Point
// PORTFOLIO_ROOT elsewhere, or drop images in ./project-media, to override.
const portfolioRoot = process.env.PORTFOLIO_ROOT ?? String.raw`C:\Users\Gaming PC\Desktop\Repos\portfolio`;

export default {
  slug: "skyfall",
  classification: "web-app",

  curated: {
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

  // How the portfolio screenshot pipeline photographs this project.
  capture: {
    "route": "/",
    "waitAfterReadyMs": 2200
  },

  scores: {
    "priorityScore": 76,
    "demoabilityScore": 92,
    "depthScore": 88,
    "polishScore": 86,
    "uniquenessScore": 86,
    "maintenanceScore": 82
  },

  analysisNotes:
    "Current canonical Phaser arcade game with Vite build, Electron packaging, tests, and a strong immediate gameplay demo.",

  // Where the link-preview card lives: the page head that carries the Open
  // Graph tags, and the static directory the image is published from.
  social: {
    "htmlFile": "index.html",
    "pageTitle": "Skyfall",
    "staticDir": "public",
    "imageName": "og-image.jpg",
    "imageUrlPath": "/og-image.jpg"
  },

  // The icon set is rendered from favicon.svg by scripts/generate-app-icons.mjs.
  icons: {
    "background": "#0b1a3a",
    "themeColor": "#0b1a3a",
    "shortName": "Skyfall"
  },

  media: {
    sourceDir: path.join(portfolioRoot, "public", "project-shots", "skyfall", "latest"),
    publicPathPrefix: "/project-shots/skyfall/latest",
    primaryProfile: "card"
  }
};
