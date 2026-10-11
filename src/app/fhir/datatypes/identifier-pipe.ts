import { Pipe, PipeTransform } from '@angular/core';
import type { Identifier } from 'fhir/r4';

/** The value of the first identifier issued under `system` (e.g. the hospital's MRN system). */
export function identifierValue(
  identifiers: Identifier[] | undefined | null,
  system: string,
): string {
  return identifiers?.find((i) => i.system === system)?.value ?? '';
}

/** `{{ patient.identifier | identifier: MRN_SYSTEM }}` → "SEED-0001" */
@Pipe({ name: 'identifier' })
export class IdentifierPipe implements PipeTransform {
  transform(identifiers: Identifier[] | undefined | null, system: string): string {
    return identifierValue(identifiers, system);
  }
}
