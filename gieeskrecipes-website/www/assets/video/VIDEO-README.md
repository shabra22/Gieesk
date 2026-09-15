# Hero Video Backdrop

The site works fully without video — the WebGL ingredient scene carries
it. Video is an enhancement layered underneath.

## Setup

1. Put three clips here as `clip1.mp4`, `clip2.mp4`, `clip3.mp4`
2. Run:
   ```bash
   bash BUILD-REEL.sh
   ```
3. That produces `hero-reel.mp4`, `hero-reel.webm`, `hero-poster.jpg`
4. Commit and push — it picks them up automatically

No code changes needed. If the files aren't here, the site silently
falls back to the 3D scene.

## Licensing

Use footage you own or that is licensed for commercial use.
Free commercial sources:

| Source | Notes |
|---|---|
| Pexels Video | Free, commercial use, no attribution |
| Coverr | Free, built for website backgrounds |
| Mixkit | Free tier, commercial licence |
| Artgrid / Filmsupply | Paid, broadcast quality |

Search terms that suit this site: *slow motion ingredients*,
*spices falling*, *herbs water splash*, *cooking macro*, *fruit bokeh*.

**Avoid** re-using clips found on Pinterest or Instagram — those are
almost always someone else's work, and a takedown on your homepage
background is not a good day.

## File size

`hero-reel.mp4` should stay **under ~4 MB**. It loads on every visit.
If it's larger, in `BUILD-REEL.sh` raise `CRF` to 32–34 or lower `SEG`.

Check with: `ls -lh hero-reel.mp4`

## Tuning the look

Live grade (no re-encode) — `js/hero-video.js`, `CONFIG.grade`:

| Setting | Effect |
|---|---|
| `brightness` | **0.62** — lower if text is hard to read |
| `blur` | **1.5px** — keeps it a backdrop, not a distraction |
| `sepia` | **0.16** — warmth |
| `saturate` | **1.12** |

Baked grade (needs re-encode) — the `GRADE=` line in `BUILD-REEL.sh`.

## Multi-clip mode

To give each cuisine its own clip, set `CONFIG.mode = 'multi'` in
`js/hero-video.js` and drop in `kenya.mp4`, `ethiopia.mp4`,
`italy.mp4`, `tanzania.mp4`. They cross-fade on scroll.

## What's automatic

- Skipped on mobile, save-data, 2G, and `prefers-reduced-motion`
- Pauses off-screen and on tab blur
- Falls back silently to the 3D scene if anything fails
- Poster shows instantly while buffering

---

# Data pipeline

`js/data.js` is the **source of truth**. After editing it, run:

```bash
node build-data.js
```

That regenerates `data/index.json` and `data/recipes/*.json`.
It will refuse to build if any recipe ID is duplicated.

`js/data.js` is **not shipped to the browser** — it's build input only.
