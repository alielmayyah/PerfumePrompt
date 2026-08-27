# Perfume Campaign Studio — Architecture

## 1. Current architecture analysis

The repository was **empty** at the time of inspection:

| Checked | Found |
| --- | --- |
| Framework / package.json | none |
| Folder structure | flat, single file |
| Env vars / `.env*` | none |
| API / server | none |
| Database / Supabase | none |
| UI components / styling | none |
| Upload / auth | none |
| TypeScript config | none |
| Build / deploy config | none |
| Files | `perfumes.json` (0 bytes) |

There was therefore no existing architecture to preserve. The only existing artifact,
`perfumes.json`, has been given a purpose rather than deleted: it is the **seed catalog**
consumed by `npm run seed`.

## 2. Proposed architecture

**Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4**, with all AI
and secret handling inside Node-runtime route handlers.

Persistence and object storage are **entirely local**: a single JSON file for
records, plain files for images. Both sit behind a driver interface with exactly one
implementation, which keeps the seam for a hosted backend later without paying for
one now.

```
Browser (React Server + Client Components)
  |  fetch -> /api/*
  v
Route handlers (thin; parse -> validate -> delegate -> map errors)
  v
Services
  |-- perfumeService     |-- campaignService    |-- pipelineService
  |-- jobService         |-- statsService       +-- masterReferenceService
  v
services/ai
  |-- AIProvider (interface, 5 stages)
  |-- stages: bottleAnalysis . perfumeResearch . creativeDirector
  |           campaignGenerator . qualityControl
  |-- promptBuilder (deterministic, pure)
  |-- prompts/ (versioned prompt registry)
  +-- gemini/ (LlmClient implementation - the only file importing @google/genai)
  v
lib/db (JSON store)      lib/storage (filesystem)      Gemini API
```

### Key boundaries

* `promptBuilder.ts` is **pure and deterministic** - no network, no React, unit-tested.
* Stage modules depend on the `LlmClient` primitive interface, never on `@google/genai`.
* `GeminiAIProvider` is assembled from the stages; swapping vendors means implementing
  one interface.
* Aspect ratio, variation count, and the quality threshold live in
  `lib/config/constants.ts` - never inline.
* Services call `getDb()` and `getStorage()` only. Neither the drivers nor their file
  layout are visible above that line, so replacing the JSON store with Postgres is a
  one-file change.

## 3. Files created

See `README.md` § "Project layout" for the annotated tree. Nothing pre-existing was
overwritten except `perfumes.json` (empty -> seed catalog).

## 4. Persistence

No schema, no migration, no service to provision.

```
.data/
  studio.json                        perfumes, campaigns, generation jobs
  storage/perfumes/{id}/bottle|references|campaigns|final/
```

`studio.json` is written atomically (temp file plus rename) with every mutation
serialised through a promise chain, so an interrupted write cannot corrupt it. Images
are never embedded in the JSON - only their paths are - and are served through
`/api/files/[...path]`, which rejects anything outside the `perfumes/` namespace while
the driver independently blocks traversal out of the storage root.

The domain types in `src/lib/types/` are the schema of record. Campaign rows snapshot
the creative direction and prompt versions at generation time, which is what makes
history reproducible when a perfume is edited afterwards.

The explicit trade-off: this is single-instance. Two servers sharing one `.data/`
directory would corrupt it, and there is no remote backup. That is the accepted cost
of keeping everything local.

## 5. AI pipeline

| Stage | Model class | Input | Output |
| --- | --- | --- | --- |
| A. Bottle analysis | text+vision, JSON schema | bottle image, name | `BottleAnalysis` |
| B. Perfume research | text + `google_search`, then JSON extraction | brand/name/variant | `PerfumeResearch` (requires user approval) |
| C. Creative director | text+vision, JSON schema | analysis, image, notes, master ref, **prior concepts** | `CreativeDirection` |
| D. Campaign generation | image model | bottle image + master ref + built prompt, N seeds | N variation images |
| E. Quality control | text+vision, JSON schema | generated image + bottle image + direction | `QualityReport` |

Stage B is two-pass on purpose: search grounding and response schemas are mutually
exclusive, so grounded prose is produced first and distilled second.
## 6. Implementation phases

All nine phases are implemented. Each was type-checked, linted and tested before the
next began; the whole surface was then smoke-tested against a running server.

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Inspect + plan (this document) | done |
| 2 | Config, types, schemas, db/storage drivers, perfume CRUD, upload, dashboard | done |
| 3 | Bottle analysis (Stage A) + editable analysis UI | done |
| 4 | Notes editor, research + approval workflow (Stage B) | done |
| 5 | Creative Director (Stage C), editable direction, regeneration | done |
| 6 | Image generation (Stage D): real bottle ref + master ref + variations | done; live model calls unverified (no API key available) |
| 7 | Quality control (Stage E), scoring, review, approval | done; live model calls unverified |
| 8 | Typography compositor, PNG export, campaign history | done |
| 9 | Batch generation, job queue, progress UI | done |

Everything not requiring a Gemini key was verified end to end against a running
server: CRUD, upload with magic-byte validation, UTF-8 (Arabic) round-trip, note
de-duplication, derived status transitions, campaign creation guards, export
validation (aspect-ratio and PNG checks), storage read-through with a traversal
guard, batch enqueue plus asynchronous worker pickup and failure recording, and
every page rendering. The five AI stages are covered by unit tests at the prompt and
schema boundary; their live request/response behaviour needs a key to confirm.
