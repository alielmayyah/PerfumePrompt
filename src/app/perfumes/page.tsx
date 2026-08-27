import { PageHeader } from '@/components/layout/PageHeader';
import { LinkButton } from '@/components/ui/LinkButton';
import { EmptyState } from '@/components/ui/States';
import { PerfumeMatrix, type MatrixRow } from '@/components/prompt/PerfumeMatrix';
import { listPerfumes } from '@/services/perfumeService';
import { buildPerfumePrompt } from '@/services/perfumePrepService';

export const dynamic = 'force-dynamic';

export default async function PerfumesPage() {
  const perfumes = await listPerfumes();

  /*
   * Prompts are built here rather than in the browser.
   *
   * The clipboard API only works inside the click that triggered it, so fetching a
   * prompt on demand risks losing that gesture. A dozen prompts is a few tens of
   * kilobytes, which is cheaper than the alternative.
   */
  const rows: MatrixRow[] = await Promise.all(
    perfumes.map(async (perfume) => {
      if (!perfume.creativeDirection) return { perfume };
      try {
        const built = await buildPerfumePrompt(perfume.id);
        return { perfume, prompt: built.prompt };
      } catch {
        // A perfume whose prompt cannot be built still belongs in the table, so the
        // gap is visible and fixable rather than hidden.
        return { perfume };
      }
    }),
  );

  return (
    <>
      <PageHeader
        eyebrow="Library"
        title="Prompt matrix"
        description="Every prepared perfume, with its prompt and bottle image a click away. Open a row to correct its notes, swap the bottle, or adjust the art direction."
        actions={
          <LinkButton variant="primary" href="/">
            Prepare more
          </LinkButton>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing prepared yet"
          description="Paste a list of perfumes on the Prepare screen and the rest is automatic."
          action={
            <LinkButton variant="primary" href="/">
              Prepare perfumes
            </LinkButton>
          }
        />
      ) : (
        <PerfumeMatrix rows={rows} />
      )}
    </>
  );
}
