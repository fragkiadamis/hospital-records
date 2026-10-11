import { Pipe, PipeTransform } from '@angular/core';
import type { CodeableConcept, Coding } from 'fhir/r4';

/** The coding from a given code system, e.g. the ICD-10 one among a concept's codings. */
export function findCoding(
  concept: CodeableConcept | undefined | null,
  system: string,
): Coding | undefined {
  return concept?.coding?.find((c) => c.system === system);
}

/**
 * What to call a coded concept: its `text` (how the user or source system named it), else a
 * coding's `display`, else a bare code. Pass `preferredSystem` to try that system's coding first.
 */
export function formatCodeableConcept(
  concept: CodeableConcept | undefined | null,
  preferredSystem?: string,
): string {
  if (!concept) return '';
  if (concept.text) return concept.text;

  const preferred = preferredSystem ? findCoding(concept, preferredSystem) : undefined;
  const codings = preferred ? [preferred, ...(concept.coding ?? [])] : (concept.coding ?? []);
  return codings.find((c) => c.display)?.display ?? codings.find((c) => c.code)?.code ?? '';
}

/**
 * `{{ condition.code | codeableConcept }}` → "Breast cancer".
 * Lists such as Condition.category are joined: "Problem list item, Encounter diagnosis".
 */
@Pipe({ name: 'codeableConcept' })
export class CodeableConceptPipe implements PipeTransform {
  transform(
    concept: CodeableConcept | CodeableConcept[] | undefined | null,
    preferredSystem?: string,
  ): string {
    const concepts = Array.isArray(concept) ? concept : [concept];
    return concepts
      .map((c) => formatCodeableConcept(c, preferredSystem))
      .filter(Boolean)
      .join(', ');
  }
}
