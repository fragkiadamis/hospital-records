import { Pipe, PipeTransform } from '@angular/core';
import type { HumanName } from 'fhir/r4';

/** The name that represents a person: the official one, else the usual one, else the first. */
export function preferredName(names: HumanName[] | undefined | null): HumanName | undefined {
  return (
    names?.find((n) => n.use === 'official') ?? names?.find((n) => n.use === 'usual') ?? names?.[0]
  );
}

/** The preferred name as text. Uses `text` when the source system gave a ready-made full name. */
export function formatHumanName(names: HumanName[] | undefined | null): string {
  const name = preferredName(names);
  if (!name) return '';
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
