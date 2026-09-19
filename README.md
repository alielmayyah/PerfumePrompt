# Perfume prompt preparer

Type a brand and a name. Get a detailed image-generation prompt and the real bottle
photograph, both one click from your clipboard.

```
brand + name → scrape notes + bottle image → art direction → prompt + raw image
```

Built for pasting into a tool that takes a text prompt alongside a reference image,
such as Google Flow. It calls no generation API and needs no API key.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

That is the whole setup. No API key, no database to provision, no cloud account. The
store is a single JSON file at `.data/studio.json` and downloaded images are plain files
under `.data/storage/`, both created on first write and both gitignored.

### Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
| `npm run seed` | Import `perfumes.json` through the API |

---

## The flow

Two modes on the Prepare screen: **one perfume**, or **a whole list**.

For a list, paste a JSON array or one perfume per line and it works through them in
turn — roughly half a minute each, sequential on purpose so a dozen perfumes do not
fire a burst of requests at the same handful of sites. Progress is per row, so a
failure is visible without stopping the rest.

Either way, for each perfume it:

1. **searches for product pages** and reads a handful, preferring reference databases
   for notes;
2. **extracts the note pyramid**, weighted accords where a source publishes them, and
   the release year;
3. **collects bottle images** from those same pages and ranks them;
4. **looks at the actual pixels** in your browser to tell a product shot from a
   lifestyle photograph, re-ranks, and accepts the winner as the product reference;
5. **samples that bottle's dominant colours**;
6. **derives an art direction** from rules, using the accords to pick a visual world and
   the bottle's own colours for the palette and light temperature;
7. **builds the prompt**, ready to copy.

Then copy what you need: **Copy prompt**, **Copy image**, or **Copy both**.

`Copy both` puts the text and the image on the clipboard in one write, but a destination
app reads one representation per paste — so it is still two pastes: text into the prompt
box, image as the reference. The separate buttons exist because that is often what you
actually want: the image only changes when you swap the reference, so once it is in Flow
you only need the text. A **Download** action covers browsers that refuse image writes.

Per-take buttons copy text only, since the bottle reference is identical across takes.

The **Matrix** page is the working view for a batch: every prepared perfume as a row,
with its bottle thumbnail, concept, note count, and **Prompt / Image / Both / Save**
buttons. Prompts are built server-side and passed into the page, because the clipboard
API only works inside the click that triggered it — fetching a prompt on demand would
risk losing that gesture.

Everything is editable afterwards. Open a row to fix a note, swap the bottle reference,
or adjust the art direction; the prompt rebuilds from whatever is saved.

---

## Environment

Nothing is required. `.env.example` lists the few defaults worth changing:

| Variable | Default | Notes |
| --- | --- | --- |
| `STUDIO_LOCAL_DATA_DIR` | `.data` | Holds `studio.json`. |
| `STUDIO_LOCAL_STORAGE_DIR` | `.data/storage` | Holds downloaded images. |
| `STUDIO_EXPORT_DIR` | `exports` | Where saved prompt files are written. |
| `STUDIO_TAKE_COUNT` | `3` | Alternative takes to build prompts for. |
| `STUDIO_DEFAULT_ASPECT_RATIO` | `4:5` | `1:1` · `4:5` · `9:16`. |

There are no secrets and no `NEXT_PUBLIC_` variables anywhere.

---

## How the art direction is decided

`services/creativeDirectorRules.ts` picks one of eight visual worlds, then chooses among
interchangeable variants using a hash of the perfume identity, so two smoky fragrances
get different scenes rather than the same one. Four rules carry the weight:

- **Notes vote once, for their most specific match.** Counting every match lets
  ubiquitous base notes win, which would score a coffee fragrance called *Qahwa* as an
  amber one on sheer volume. Worlds carry a specificity weight, and overlapping hints
  resolve to the longest match, so "Orange Blossom" reads floral rather than citrus.
- **The note that chose the world leads the frame.** Otherwise ranking falls back to
  listing order, which puts top notes first, and a smoke-dominant oriental would open on
  its aquatic top note.
- **Atmospherics are never props.** Smoke is not something you place on a surface, so
  notes that translate to an effect go to `atmosphericEffects` and never occupy one of
  the few hero slots.
- **A motif appears only when the bottle has one.** A rule engine is the right place to
  make that absolute: no amount of dark, dramatic input can talk it into adding a serpent
  the product does not carry.

The palette and light temperature come from the bottle itself, sampled in the browser
because the browser decodes JPEG, WebP and AVIF natively.

---

## Sourcing notes and images

Both target **product pages, not image search**: search-engine image results are
re-hosted thumbnails, and a thumbnail cannot preserve a product.

### Picking the right bottle image

This is harder than it sounds, and getting it wrong is the most visible failure the app
has. Ranking by resolution alone reliably picks the wrong image: on a real fragrance page
the largest assets are the theme background and the campaign photography, while the
product shot is a modest square somewhere in the middle. An early version accepted a
2400×2035 file called `bg-desk.png` — the site's desktop wallpaper.

Three signals, in increasing order of authority:

1. **Chrome rejection.** Filenames that are never the product: backgrounds, sliders,
   carousels, payment badges, avatars.
2. **Name relevance.** Whether the filename names this perfume, matched after flattening
   to bare alphanumerics so `BlackDiamondIncense.png` registers. The **filename counts for
   double the alt text**, because alt is often applied blanket across a whole gallery —
   which means a campaign render sitting beside the product inherits the product's alt and
   looks equally relevant.
3. **The pixels.** Measured in your browser, since the server has no image decoder. A
   product shot sits on a plain, uniform ground; a lifestyle photograph does not. The
   measure combines border uniformity, subject contrast and background whiteness, and is
   weighted **squared** — partial uniformity is common in composed shots and renders, so a
   linear weighting left a genuine studio photograph only fractions of a percent ahead of
   an AI render. Squaring makes real confidence decisive.

Candidates are also deduplicated on a *normalised* URL. Retail templates emit the same
asset a dozen times over — `http` and `https`, doubled slashes, a different `width=` per
`srcset` entry — and a raw-string compare lets one photo occupy every candidate slot.

Every candidate is shown in the picker with its size and a verdict (**product shot**,
**composed**, **busy scene**), so a wrong automatic pick is visible at a glance and one
click away from being corrected.

### Notes

Notes are parsed with three strategies in preference order — a linked pyramid, a
`data-nt`-tagged pyramid, then prose (`Top Notes: a, b, c`) — all pure functions tested
against captured markup.

Fetches are spaced out, and `assertHttpUrl` rejects private and loopback hosts, without
which these endpoints would be a server-side request forgery primitive.

Scraped notes are stored **unapproved**: they are evidence, not truth, and the prompt
carries a warning until you sign them off.

Note that product photography belongs to whoever shot it. Using a manufacturer or
retailer image to advertise a product you actually sell is ordinary retail practice, but
the decision is yours.

---

## Project layout

```
src/
  app/
    page.tsx  PrepareRunner.tsx    the whole flow, one screen
    perfumes/                      library + per-perfume editing
    api/
      perfumes/scrape              brand + name -> notes, bottle, direction, prompt
      perfumes/[id]/references     find + accept bottle references
      perfumes/[id]/palette        store sampled colours, rebuild direction
      perfumes/[id]/prompt         the prompt, optionally saved to exports/
      perfumes/[id]/bottle         manual upload
      files/[...path]              serves stored images
  components/  ui/ layout/ perfume/ creative/ prompt/
  lib/
    config/     constants.ts (ratios, paths) · env.ts (server-only)
    types/      Perfume — the schema of record
    schemas/    ai.ts (validators) · api.ts (request bodies)
    db/         driver.ts · local.ts · shared.ts
    storage/    driver.ts · local.ts · remote.ts
    utils/      clipboard · noteExtraction · html · imageSize · image · id · format
  services/
    perfumePrepService     brand + name -> prompt
    perfumeScraperService  notes, accords and metadata from product pages
    creativeDirectorRules  the rule-based art director
    paletteExtraction      browser-side bottle colour sampling
    referenceImageService  bottle candidate discovery
    productSearchService   product page search
    perfumeService · exportFolder
    ai/promptBuilder + prompts/    the prompt itself, versioned
tests/
```

---
