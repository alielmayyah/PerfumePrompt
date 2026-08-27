import { PageHeader } from '@/components/layout/PageHeader';
import { PrepareRunner } from './PrepareRunner';

/**
 * The whole app: a prompt preparer.
 *
 * Type a brand and a name, and it scrapes the fragrance notes and the real bottle
 * photograph, works out an art direction from them, and hands back a detailed prompt
 * plus the raw bottle image, both ready to copy into an image tool.
 */
export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <>
      <PageHeader
        eyebrow="Prepare"
        title="Prompt preparer"
        description="Name a perfume and give it a page to read. You get the fragrance notes, the real bottle photograph, an art direction derived from both, and a prompt ready to paste into Google Flow."
      />
      <PrepareRunner />
    </>
  );
}
