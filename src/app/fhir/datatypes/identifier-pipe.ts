import { Pipe, PipeTransform } from '@angular/core';
import type { Identifier } from 'fhir/r4';

/** The value of the first identifier issued under `system` (e.g. the hospital's MRN system). */
export function identifierValue(
  identifiers: Identifier[] | undefined | null,
  system: string,
): string {
  return identifiers?.find((i) => i.system === system)?.value ?? '';
}

/**
 * What to call an identifier: its own `type` label if it has one, else the label the caller
 * knows for its system (e.g. { [MRN_SYSTEM]: 'MRN' }), else the system URI itself.
 */
export function identifierLabel(
  identifier: Identifier,
  knownSystems: Readonly<Record<string, string>> = {},
): string {
  const coding = identifier.type?.coding?.[0];
  return (
    identifier.type?.text ??
    coding?.display ??
    (identifier.system ? knownSystems[identifier.system] : undefined) ??
    identifier.system ??
    coding?.code ??
    'Identifier'
  );
}

/** `{{ patient.identifier | identifier: MRN_SYSTEM }}` → "SEED-0001" */
@Pipe({ name: 'identifier' })
export class IdentifierPipe implements PipeTransform {
  transform(identifiers: Identifier[] | undefined | null, system: string): string {
    return identifierValue(identifiers, system);
  }
}
