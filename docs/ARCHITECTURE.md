# Perfume Campaign Studio — Architecture

## 1. Overview

**Perfume prompt preparer**: Given a brand and perfume name, the application scrapes the note pyramid and bottle images from product pages, derives an art direction using deterministic rule engines, and outputs copy-ready image generation prompts paired with the real bottle photo.

```
brand + name -> scrape notes + bottle image -> rule-based art direction -> prompt + raw image
```

It calls **no generation API** and requires **no external AI keys**. All logic is pure and deterministic or runs locally.

## 2. Architecture

**Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4**.

```
Browser (React Server + Client Components)
  |  fetch -> /api/*
  v
Route handlers (thin: parse -> validate -> delegate -> map errors)
  v
Services
  |-- perfumePrepService        (orchestrates brand + name -> prompt)
  |-- perfumeScraperService     (scrapes notes, accords, pyramids from product pages)
  |-- creativeDirectorRules     (deterministic rule-based art direction, no model call)
  |-- paletteExtraction         (browser-side bottle colour sampling)
  |-- referenceImageService     (fetches, validates, and ranks product shots)
  |-- productShotDetection      (client-side visual scoring of bottle images)
  |-- perfumeService            (CRUD operations on studio store)
  v
Prompt Builder
  +-- promptBuilder             (pure, deterministic prompt assembly)
  v
Persistence
  +-- lib/db (local JSON store) +-- lib/storage (local filesystem)
```

### Key boundaries

* `promptBuilder.ts` is **pure and deterministic**: no network, no React, fully unit-tested. Prompts are derived on read from the current notes and direction, not stored statically.
* `creativeDirectorRules.ts` replaces model calls with rule-based heuristics across eight visual worlds based on accords and note tiers.
* Aspect ratio, defaults, and storage paths live in `src/lib/config/constants.ts` and `src/lib/config/env.ts`.
* Services interact with `getDb()` and `getStorage()` through driver interfaces.

## 3. Persistence

No database schema, no migrations, no cloud service to provision.

```
.data/
  studio.json                        perfumes, references, takes
  storage/perfumes/{id}/...          downloaded bottle images
```

`studio.json` is written atomically (temp file plus rename) with serialized mutations to prevent file corruption. Images are served through `/api/files/[...path]` with directory traversal protections.

## 4. Clipboard Handoff

* Supports copying the prompt text, the bottle image, or both.
* Clipboard image writes re-encode to PNG via canvas on same-origin endpoints (`/api/files/...`).
* Always gracefully degrades to text if browser permissions or security context prevent binary clipboard writes.
