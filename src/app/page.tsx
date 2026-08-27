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
        title="Prompt preparer"
        description="Brand and name in. Scrapes the fragrance notes and the real bottle photograph from the open web, works out the art direction, and gives you a detailed prompt plus the raw bottle image to copy into Google Flow."
      />
      <PrepareRunner />
    </>
  );
}
