'use client';

import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, Select, TextArea, TextInput } from '@/components/ui/Field';
import { TagInput } from '@/components/ui/TagInput';
import { HERO_ELEMENT_RANGE } from '@/lib/config/constants';
import type { CreativeDirection } from '@/lib/types';
import {
  ATMOSPHERE,
  CAMERA_ANGLES,
  ENVIRONMENTS,
  LIGHTING,
  MATERIALS,
  SYMBOLIC_ELEMENTS,
} from '@/services/ai/vocabulary';
import { PaletteEditor } from './PaletteEditor';

export interface CreativeDirectionEditorProps {
  direction?: CreativeDirection;
  generating: boolean;
  canGenerate: boolean;
  guidance: string;
  onGuidanceChange: (value: string) => void;
  onGenerate: () => void;
  onChange: (direction: CreativeDirection) => void;
}

/**
 * Stage C review surface.
 *
 * Everything the Creative Director decided is editable before generation, because a
 * one-word correction here is far cheaper than three regenerated images.
 */
export function CreativeDirectionEditor({
  direction,
  generating,
  canGenerate,
  guidance,
  onGuidanceChange,
  onGenerate,
  onChange,
}: CreativeDirectionEditorProps) {
  const set = <K extends keyof CreativeDirection>(key: K, value: CreativeDirection[K]) => {
    if (!direction) return;
    onChange({ ...direction, [key]: value });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Creative direction"
          description="Reasoned from this bottle and these notes. The master reference sets quality only, never the scene."
          actions={
            <Button
              variant={direction ? 'secondary' : 'primary'}
              size="sm"
              loading={generating}
              disabled={!canGenerate}
              onClick={onGenerate}
            >
              {direction ? 'Regenerate direction' : 'Generate direction'}
            </Button>
          }
        />

        <Field
          label="Art director guidance"
          hint="Optional. Steers the concept, e.g. keep it lighter, or lean architectural."
        >
          {({ id }) => (
            <TextArea
              id={id}
              rows={2}
              value={guidance}
              placeholder="Leave empty to let the studio decide."
              onChange={(event) => onGuidanceChange(event.target.value)}
            />
          )}
        </Field>

        {!direction ? (
          <p className="mt-4 text-sm text-bone-600">
            {canGenerate
              ? 'No direction yet.'
              : 'Add fragrance notes before generating a creative direction.'}
          </p>
        ) : null}
      </Card>

      {direction ? (
        <>
          <Card>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Concept" className="sm:col-span-2">
                {({ id }) => (
                  <TextInput
                    id={id}
                    value={direction.concept}
                    onChange={(e) => set('concept', e.target.value)}
                    className="studio-display text-lg"
                  />
                )}
              </Field>

              <Field label="Mood">
                {({ id }) => (
                  <TextInput id={id} value={direction.mood} onChange={(e) => set('mood', e.target.value)} />
                )}
              </Field>

              <Field label="Visual story">
                {({ id }) => (
                  <TextInput
                    id={id}
                    value={direction.visualStory}
                    onChange={(e) => set('visualStory', e.target.value)}
                  />
                )}
              </Field>

              <Field label="Environment" hint="One place, not a montage.">
                {({ id }) => (
                  <TextInput
                    id={id}
                    list="studio-environments"
                    value={direction.environment}
                    onChange={(e) => set('environment', e.target.value)}
                  />
                )}
              </Field>

              <Field label="Lighting" hint="One primary lighting concept.">
                {({ id }) => (
                  <TextInput
                    id={id}
                    list="studio-lighting"
                    value={direction.lighting}
                    onChange={(e) => set('lighting', e.target.value)}
                  />
                )}
              </Field>

              <Field label="Background">
                {({ id }) => (
                  <TextInput
                    id={id}
                    value={direction.background}
                    onChange={(e) => set('background', e.target.value)}
                  />
                )}
              </Field>

              <Field label="Surface">
                {({ id }) => (
                  <TextInput
                    id={id}
                    list="studio-materials"
                    value={direction.surface}
                    onChange={(e) => set('surface', e.target.value)}
                  />
                )}
              </Field>

              <Field label="Composition">
                {({ id }) => (
                  <TextInput
                    id={id}
                    value={direction.composition}
                    onChange={(e) => set('composition', e.target.value)}
                  />
                )}
              </Field>

              <Field label="Camera angle">
                {({ id }) => (
                  <TextInput
                    id={id}
                    list="studio-camera-angles"
                    value={direction.cameraAngle}
                    onChange={(e) => set('cameraAngle', e.target.value)}
                  />
                )}
              </Field>
            </div>

            <datalist id="studio-environments">
              {ENVIRONMENTS.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
            <datalist id="studio-lighting">
              {LIGHTING.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
            <datalist id="studio-materials">
              {MATERIALS.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
            <datalist id="studio-camera-angles">
              {CAMERA_ANGLES.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </Card>

          <Card>
            <CardHeader
              title="Scene elements"
              description={`Keep hero elements between ${HERO_ELEMENT_RANGE.min} and ${HERO_ELEMENT_RANGE.max}. An overcrowded frame is the most common failure.`}
            />
            <div className="space-y-5">
              <TagInput
                label={`Hero elements (${direction.heroElements.length}/${HERO_ELEMENT_RANGE.max})`}
                values={direction.heroElements}
                onChange={(v) => set('heroElements', v)}
                maxItems={HERO_ELEMENT_RANGE.max}
              />
              <TagInput
                label="Secondary elements"
                values={direction.secondaryElements}
                onChange={(v) => set('secondaryElements', v)}
                maxItems={4}
              />
              <TagInput
                label="Atmospheric effects"
                values={direction.atmosphericEffects}
                onChange={(v) => set('atmosphericEffects', v)}
                placeholder="smoke, mist, light rays"
                maxItems={4}
              />

              <Field
                label="Symbolic element"
                hint="Only when the bottle or the fragrance genuinely justifies it. The perfume stays the hero."
              >
                {({ id }) => (
                  <Select
                    id={id}
                    value={direction.symbolicElement ?? 'none'}
                    onChange={(e) =>
                      set(
                        'symbolicElement',
                        e.target.value === 'none' ? undefined : e.target.value,
                      )
                    }
                  >
                    {SYMBOLIC_ELEMENTS.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                    {direction.symbolicElement &&
                    !(SYMBOLIC_ELEMENTS as readonly string[]).includes(direction.symbolicElement) ? (
                      <option value={direction.symbolicElement}>{direction.symbolicElement}</option>
                    ) : null}
                  </Select>
                )}
              </Field>

              <datalist id="studio-atmosphere">
                {ATMOSPHERE.map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
            </div>
          </Card>

          <Card>
            <CardHeader title="Colour palette" description="Three to six colours that agree with the bottle." />
            <PaletteEditor
              colors={direction.colorPalette}
              onChange={(colors) => set('colorPalette', colors)}
            />
          </Card>
        </>
      ) : null}
    </div>
  );
}
