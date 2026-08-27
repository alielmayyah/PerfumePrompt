<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Perfume prompt preparer

Type a brand and a name, get an image-generation prompt plus the real bottle photograph,
both copyable. That is the entire product.

```
brand + name -> scrape notes + bottle image -> art direction -> prompt + raw image
```

**It calls no generation API.** An earlier version did; the image models turned out to
require a paid plan, so the app was scoped down to preparing prompts for whichever tool
the user has (Google Flow). Do not reintroduce a generation dependency, an API key, or a
quality-control stage without being asked.

## Commands

```bash
npm run dev
npm run build
npm run typecheck
npm run lint
npm test
npm run seed        # imports perfumes.json via the API; dev server must be running
```

Run `npm run typecheck && npm run lint && npm test` before considering a change done.

## Architecture

```
src/app/         one screen (page.tsx + PrepareRunner) plus the perfume library
                 route handlers stay thin: parse -> validate -> delegate -> map errors
src/components/  ui/ layout/ perfume/ creative/ prompt/
src/lib/
  config/        constants.ts (ratios, storage paths) · env.ts (server-only, no secrets)
  types/         Perfume — the schema of record
  schemas/       ai.ts (validators) · api.ts (request bodies)
  db/            driver.ts (interface) · local.ts (the only driver) · shared.ts
  storage/       driver.ts · local.ts · remote.ts
  utils/         clipboard · noteExtraction · html · imageSize · image · id · format
src/services/
  perfumePrepService     brand + name -> prompt (the main flow)
  perfumeScraperService  notes, accords, metadata from product pages
  creativeDirectorRules  rule-based art director, no model call
  paletteExtraction      browser-only bottle colour sampling
  referenceImageService · productSearchService · perfumeService · exportFolder
  ai/promptBuilder + prompts/  the prompt itself, versioned
tests/
```

## Things that will trip you up

**Everything is local and there are no secrets.** Persistence is `.data/studio.json`;
images are files under `.data/storage/`. Both sit behind driver interfaces with exactly
one implementation each — that seam is where a hosted backend would go.

**`server-only` modules cannot be imported from plain Node.** `lib/config/env.ts`, `db/`,
`storage/` and the services all import it. Next aliases it in its own bundler; a bare
`node` process cannot resolve it. Hence `scripts/seed.ts` talks to the app over HTTP, and
`tests/stubs/server-only.ts` exists (aliased in `vitest.config.ts`).

**Patch semantics: an explicit `undefined` clears a field.** A key present in a patch is
applied even when undefined; an absent key is left alone. Request bodies come from zod,
which omits absent optional keys rather than emitting them as undefined, so an HTTP PATCH
cannot clear a field by accident. Do not "helpfully" filter undefined out of patches.

**Perfume status is derived, never set.** `derivePerfumeStatus` computes it from the data,
so it cannot drift.

**`promptBuilder` is pure and must stay that way.** No network, no React, no reading env at
call time. Components must never assemble a prompt.

**The prompt is derived, not stored.** It is rebuilt from the current notes and direction on
every read, which is why editing anything updates it without a migration.

## The rule engine

`creativeDirectorRules.ts` replaces what a model used to do. Eight visual worlds; the
world is chosen by accord weight where published and by note specificity otherwise. Four
invariants that tests pin down and that are easy to break while editing the world tables:

1. Each note votes **once**, for its longest matching hint, weighted by world
   specificity. Without this, amber and vanilla outvote coffee.
2. Hero elements rank by relevance to the chosen world, then note tier — not by listing
   order, which would lead a smoky fragrance with its aquatic top note.
3. `isAtmospheric` keeps effects out of `heroElements` and `secondaryElements`.
4. A symbolic motif requires the bottle analysis to actually mention a creature.

When adding a world, give it a `specificity`: 3 for a diagnostic accord (coffee, marine,
floral), ~1 for one that appears everywhere (amber, woody).

## Scraping

Targets **product pages, not image search**: search results are re-hosted thumbnails, and
a thumbnail cannot preserve a product. Three note strategies in preference order — linked
pyramid, `data-nt`-tagged pyramid, prose — all pure and tested against captured markup.

### Picking the bottle image

Ranking by resolution picks the wrong image almost every time: the biggest assets on a
fragrance page are the theme background and the campaign photography. A previous version
accepted `bg-desk.png` (2400x2035), the site wallpaper. `referenceScore` therefore
combines:

- pixels and aspect shape (a 1200x630 is an Open Graph card, not a bottle);
- **name relevance**, matched on flattened alphanumerics so `BlackDiamondIncense.png`
  registers. The filename is weighted at **twice** the alt text, because retailers apply
  one alt across a whole gallery and a render beside the product otherwise inherits full
  relevance;
- **`visualScore`**, measured in the browser by `productShotDetection.ts` and applied
  **squared**. Squaring is deliberate: partial background uniformity is common, and a
  linear weighting left a real studio shot ~0.4% ahead of an AI render, i.e. decided by
  luck. Do not linearise it.

The visual pass necessarily runs client-side (no server decoder) and posts back to
`POST /api/perfumes/[id]/references/rank`. It is a separate call so a measurement failure
never costs the scrape.

`normaliseImageUrl` deduplicates candidates: retail templates emit one asset many times
over http/https, with doubled slashes and per-`srcset` `width=` params.

`assertHttpUrl` blocks private and loopback hosts; without it these endpoints are a
server-side request forgery primitive. `fetchRemoteImage` and `fetchPageHtml` are exported
from `referenceImageService` so every caller shares one fetch policy and its guards.

Scraped notes are saved **unapproved**. They are evidence, not truth.

## Clipboard handoff

`lib/utils/clipboard.ts` copies the prompt and the bottle reference together. Three
constraints shape it:

- One write can carry several MIME types, but a destination reads **one per paste**. So
  "copy both" does not mean "paste once" — the UI says two pastes plainly.
- Clipboard image writes are **PNG only**. Stored bottles are usually JPEG or WebP, so
  they are re-encoded through a canvas first, which needs same-origin pixels — hence
  reading the bottle from `/api/files/...` rather than an external URL.
- `navigator.clipboard.write` needs a secure context and is not universally implemented
  for images. Every path degrades to text-only; losing the prompt because the image could
  not attach would be worse than not attaching it.
