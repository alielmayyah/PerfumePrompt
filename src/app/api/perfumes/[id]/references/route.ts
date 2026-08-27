import { z } from 'zod';

import { handler, ok, parseJsonBody } from '@/lib/api/response';
import { errors } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getPerfumeOrThrow } from '@/services/perfumeService';
import { collectCandidatesFromPages } from '@/services/referenceImageService';
import { buildProductImageQuery, searchProductPages } from '@/services/productSearchService';

export const runtime = 'nodejs';
export const maxDuration = 180;

type Context = { params: Promise<{ id: string }> };

const bodySchema = z
  .object({
    /** Product page or direct image URLs to pull from. */
    urls: z.array(z.string().trim().min(4).max(2048)).max(6).optional(),
    /** Search the web for product pages instead of supplying URLs. */
    search: z.boolean().default(false),
    /** Override the generated search query. */
    query: z.string().trim().min(2).max(200).optional(),
    /** Replace any candidates already on the perfume. */
    replace: z.boolean().default(true),
  })
  .refine((v) => v.search || v.query !== undefined || (v.urls?.length ?? 0) > 0, {
    message: 'Provide urls, or set search to true.',
  });

/**
 * Finds bottle reference candidates from the web.
 *
 * Two ways in: paste product page URLs, or let it search. Either way it collects
 * candidates and returns them for a human to choose from. Nothing becomes the
 * protected product reference without an explicit accept.
 */
export const POST = handler(async (request: Request, context: Context) => {
  const { id } = await context.params;
  const perfume = await getPerfumeOrThrow(id);
  const body = await parseJsonBody(request, bodySchema);

  let pageUrls = body.urls ?? [];
  let searchedQuery: string | undefined;
  let searchedPages: { url: string; title: string }[] = [];

  if (pageUrls.length === 0) {
    searchedQuery =
      body.query ?? buildProductImageQuery(perfume.brand, perfume.name, perfume.variant);
    const results = await searchProductPages(searchedQuery);
    searchedPages = results.map((r) => ({ url: r.url, title: r.title }));
    pageUrls = results.map((r) => r.url).slice(0, 5);

    if (pageUrls.length === 0) {
      throw errors.validation(
        'Web search returned no usable product pages. Paste a product page URL instead.',
      );
    }
  }

  const { candidates, failures } = await collectCandidatesFromPages(id, pageUrls, {
    brand: perfume.brand,
    name: perfume.name,
    ...(perfume.variant ? { variant: perfume.variant } : {}),
  });

  const existing = body.replace ? [] : (perfume.referenceCandidates ?? []);
  const merged = [...existing, ...candidates];
  const updated = await getDb().updatePerfume(id, { referenceCandidates: merged });

  return ok({
    perfume: updated,
    candidates,
    failures,
    ...(searchedQuery ? { query: searchedQuery, pages: searchedPages } : {}),
  });
});

/** Clears the candidate list without touching the accepted bottle image. */
export const DELETE = handler(async (_request: Request, context: Context) => {
  const { id } = await context.params;
  await getPerfumeOrThrow(id);
  const perfume = await getDb().updatePerfume(id, { referenceCandidates: [] });
  return ok({ perfume });
});
