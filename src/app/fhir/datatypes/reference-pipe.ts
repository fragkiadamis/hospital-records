import { Pipe, PipeTransform } from '@angular/core';
import type { Reference } from 'fhir/r4';

/**
 * Type and id of a literal reference: "Patient/123", "Patient/123/_history/2" or an absolute
 * URL ending in "/Patient/123". Undefined for contained ("#x") and urn:uuid references, and
 * for references that only carry an identifier.
 */
export function parseReference(
  reference: Reference | undefined | null,
): { type: string; id: string } | undefined {
  const match = reference?.reference?.match(
    /(?:^|\/)([A-Z][A-Za-z]+)\/([A-Za-z0-9\-.]{1,64})(?:\/_history\/[^/]+)?$/,
  );
  return match ? { type: match[1], id: match[2] } : undefined;
}

/** What to call the referenced resource: its `display`, else "Patient/123", else the identifier. */
export function formatReference(reference: Reference | undefined | null): string {
  if (!reference) return '';
  if (reference.display) return reference.display;
  const parsed = parseReference(reference);
  if (parsed) return `${parsed.type}/${parsed.id}`;
  return reference.reference ?? reference.identifier?.value ?? '';
}

/** `{{ condition.subject | reference }}` → "Daphne Kostaki", or "Patient/seed-patient-1" */
@Pipe({ name: 'reference' })
export class ReferencePipe implements PipeTransform {
  transform(reference: Reference | undefined | null): string {
    return formatReference(reference);
  }
}
