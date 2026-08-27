'use client';

import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, TextArea, TextInput } from '@/components/ui/Field';
import { TagInput } from '@/components/ui/TagInput';
import type { BottleAnalysis } from '@/lib/types';

export interface BottleAnalysisPanelProps {
  analysis?: BottleAnalysis;
  analysing: boolean;
  canAnalyse: boolean;
  onAnalyse: () => void;
  onChange: (analysis: BottleAnalysis) => void;
}

/**
 * Stage A output, fully editable.
 *
 * The analysis feeds the Creative Director and the generation prompt, so a human
 * correction here is worth more than a re-run.
 */
export function BottleAnalysisPanel({
  analysis,
  analysing,
  canAnalyse,
  onAnalyse,
  onChange,
}: BottleAnalysisPanelProps) {
  const set = <K extends keyof BottleAnalysis>(key: K, value: BottleAnalysis[K]) => {
    if (!analysis) return;
    onChange({ ...analysis, [key]: value });
  };

  return (
    <Card>
      <CardHeader
        title="Bottle analysis"
        description={
          analysis
            ? 'Edit anything the model misread. This description travels into every prompt.'
            : 'Read the physical product so the campaign can be built around it without altering it.'
        }
        actions={
          <Button
            variant={analysis ? 'secondary' : 'primary'}
            size="sm"
            loading={analysing}
            disabled={!canAnalyse}
            onClick={onAnalyse}
          >
            {analysis ? 'Re-analyse' : 'Analyze bottle'}
          </Button>
        }
      />

      {!analysis ? (
        <p className="text-sm text-bone-600">
          {canAnalyse
            ? 'No analysis yet.'
            : 'Upload the real bottle image first, then run the analysis.'}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Shape">
            {({ id }) => (
              <TextInput
                id={id}
                value={analysis.shape}
                onChange={(e) => set('shape', e.target.value)}
              />
            )}
          </Field>

          <Field label="Proportions">
            {({ id }) => (
              <TextInput
                id={id}
                value={analysis.proportions}
                onChange={(e) => set('proportions', e.target.value)}
              />
            )}
          </Field>

          <div className="sm:col-span-2">
            <TagInput
              label="Materials"
              values={analysis.materials}
              onChange={(v) => set('materials', v)}
              maxItems={8}
            />
          </div>

          <div className="sm:col-span-2">
            <TagInput
              label="Dominant colours"
              values={analysis.dominantColors}
              onChange={(v) => set('dominantColors', v)}
              maxItems={8}
            />
          </div>

          <Field label="Cap" className="sm:col-span-2">
            {({ id }) => (
              <TextArea
                id={id}
                rows={2}
                value={analysis.capDescription}
                onChange={(e) => set('capDescription', e.target.value)}
              />
            )}
          </Field>

          <Field label="Bottle description" className="sm:col-span-2">
            {({ id }) => (
              <TextArea
                id={id}
                rows={2}
                value={analysis.bottleDescription}
                onChange={(e) => set('bottleDescription', e.target.value)}
              />
            )}
          </Field>

          <Field label="Visual personality">
            {({ id }) => (
              <TextInput
                id={id}
                value={analysis.visualPersonality}
                onChange={(e) => set('visualPersonality', e.target.value)}
              />
            )}
          </Field>

          <Field label="Luxury level">
            {({ id }) => (
              <TextInput
                id={id}
                value={analysis.luxuryLevel}
                onChange={(e) => set('luxuryLevel', e.target.value)}
              />
            )}
          </Field>

          <div className="sm:col-span-2">
            <TagInput
              label="Distinctive elements"
              values={analysis.distinctiveElements}
              onChange={(v) => set('distinctiveElements', v)}
              placeholder="Ornaments, embossing, motifs"
              maxItems={10}
            />
            <p className="mt-2 text-xs text-bone-600">
              These justify the symbolic element later. A bottle with a serpent motif may earn a
              serpent in the scene; a plain bottle usually should not.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
