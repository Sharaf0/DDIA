# DDIA Repository Rules

## Environment & Public Repo Hygiene
- **Zero host installs:** Never install tools or packages globally/locally on the host (`npm install`, `pip install`, `brew install`). Run all builds, validations, and POCs inside Docker containers.
- **Public repo safety:** Never commit corporate certificates (`certfile.pem`), proxy configs, corporate emails, or internal URLs. Prefer zero-external-install Docker runtimes (e.g., `node:22-alpine` running `.ts` natively or `python:3.14-slim` stdlib) so `docker compose up --build` works behind any network without `npm install` SSL workarounds.

## Chapter Presentations & POCs
- **Follow the `ddia-presentation` skill** whenever creating or updating a chapter presentation, interactive lab, or quiz.
- **Preserve exact book structure:** Mirror the chapter's numbered Table of Contents sections without inventing or merging sections.
- **Visual-first pedagogy:** Pair every book figure with bespoke inline SVG diagrams, concrete data traces, and comparison matrices so concepts are clear at a glance.
- **Self-guided POCs:** Any interactive web POC must include an offline/zero-CDN spotlight tour (Intro.js style) that executes live steps, plus a complete Reset button that clears both backend state and all client-side DOM banners, tables, and inputs without a page reload.
- **Browser verification gate:** Visually inspect slides and POCs in a browser at both desktop and compact (`~850x780`) viewports to confirm zero SVG clipping, zero `.slide-number`/`.controls` overlap, `naturalWidth > 0` for all images, and zero console errors.

## Deployment Verification
- After pushing to `main`, monitor GitHub Actions (`pages-build-deployment`) until `"status": "built"` and verify the updated slides live on `https://sharaf0.github.io/DDIA/`.
