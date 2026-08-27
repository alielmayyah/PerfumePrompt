import { notFound } from 'next/navigation';

import { getDb } from '@/lib/db';
import { perfumeDisplayName } from '@/lib/types/perfume';
import { buildPerfumePrompt } from '@/services/perfumePrepService';
import { PerfumeWorkspace } from './PerfumeWorkspace';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const perfume = await getDb().getPerfume(id);
  return {
    title: perfume ? `${perfumeDisplayName(perfume)} · Prompt preparer` : 'Prompt preparer',
  };
}

export default async function PerfumeDetailPage({ params }: PageProps) {
  const { id } = await params;
  const perfume = await getDb().getPerfume(id);
  if (!perfume) notFound();

  // The prompt is derived, not stored, so it always reflects the current notes and
  // direction. A perfume without a direction yet simply has no prompt to show.
  let prompt: string | undefined;
  let variationPrompts: string[] | undefined;
  if (perfume.creativeDirection) {
    const built = await buildPerfumePrompt(id);
    prompt = built.prompt;
    variationPrompts = built.variationPrompts;
  }

  return (
    <PerfumeWorkspace
      perfume={perfume}
      {...(prompt ? { prompt } : {})}
      {...(variationPrompts ? { variationPrompts } : {})}
    />
  );
}
