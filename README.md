# shemxz.com

Plain HTML, CSS and JS in `site/`, plus three small Netlify Functions. No framework, no build step.

## What's where

| Path | What it is |
| --- | --- |
| `site/index.html` | The page, all four tabs |
| `site/css/` | `base` (colors, fonts, background), `layout` (intro, nav, page transitions), `components`, then one file per tab |
| `site/js/main.js` | Boots everything: intro, tab routing, sounds |
| `site/js/home.js`, `anime.js`, `schedule.js`, `gakuran.js` | One file per tab |
| `site/js/fx.js` | Embers, vote bursts, card tilt, scroll reveals, the tab-change blade |
| `site/js/sfx.js` | Every sound, synthesized in the browser (no audio files) |
| `site/js/data.js` | Where each piece of data comes from |
| `netlify/functions/votes.mjs` | Anime list likes and dislikes |
| `netlify/functions/visits.mjs` | Visitor counter |
| `netlify/functions/gakuran.mjs` | Live Gakuran stats from Roblox, cached for a minute |
| `anime_backup.json` | The anime list. The phone app commits it here |
| `archive/` | The old single-file site and old drafts. Not published |

## Where the data lives

- **Anime list:** `anime_backup.json`, read straight from GitHub, so phone updates show up without a deploy.
- **Votes:** Netlify Blobs (Netlify's built-in storage). Each anime's total is a saved base number (worked out once per show from its title and rating), plus the old npoint votes, plus every vote since.
- **Visitor count:** Netlify Blobs too. It starts at 252,387 and counts each visitor once per 10 minutes.
- **Schedule:** AniList, fetched in the browser and cached for 2 hours. It follows the sequels of everything on the list, so new seasons show up on their own.
- **Gakuran:** Roblox's public API through `gakuran.mjs` (Roblox blocks direct browser calls).

## Deploys

`netlify.toml` publishes only `site/`. `scripts/netlify-ignore.sh` skips the deploy when a commit only touches `anime_backup.json`.

## Previewing

Open `site/index.html` in VS Code and use Live Preview ("Show Preview"). The preview has no functions of its own, so it borrows the live site's: votes and the visitor count show real data (and votes you cast there are real). Gakuran stats fall back to roproxy if needed.

For the functions themselves, run `npx netlify-cli dev` from a copy of the repo on an NTFS drive. On D: (FAT32) the CLI fails to load the functions. The local storage emulator doesn't send etags, so the visitor counter can drop increments locally. Votes don't depend on that.
