import { Pipe, PipeTransform } from '@angular/core';
import type { HumanName } from 'fhir/r4';

/**
 * The name to show for a person: the official one, else the usual one, else the first.
 * Uses `text` when the source system gave a ready-made full name.
 */
export function formatHumanName(names: HumanName[] | undefined | null): string {
  if (!names?.length) return '';
  const name =
    names.find((n) => n.use === 'official') ?? names.find((n) => n.use === 'usual') ?? names[0];
  if (name.text) return name.text;
  return [...(name.given ?? []), name.family].filter(Boolean).join(' ');
}

/** `{{ patient.name | humanName }}` → "Daphne Kostaki" */
@Pipe({ name: 'humanName' })
export class HumanNamePipe implements PipeTransform {
  transform(names: HumanName[] | undefined | null): string {
    return formatHumanName(names);
  }
}
