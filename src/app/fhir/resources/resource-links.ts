import type { Reference } from 'fhir/r4';
import { formatReference, parseReference } from '../datatypes/reference-pipe';

/** Page segment under /patients/:id for each resource type that has its own page. */
const PATIENT_PAGES: Readonly<Record<string, string>> = {
  Condition: 'conditions',
  ImagingStudy: 'studies',
};

/** Readable type names for references without a display: "Imaging study seed-study-1". */
const TYPE_NAMES: Readonly<Record<string, string>> = {
  Condition: 'Condition',
  ImagingStudy: 'Imaging study',
  Patient: 'Patient',
};

/** A reference ready to show: its text, and the app link when the target has a page. */
export interface ReferenceLink {
  text: string;
  link?: string[];
}

/**
 * Turns a reference into text and, when `patientId` is given and the target is a resource with a
 * page under that patient, a routerLink. Resource components stay display-only: they only link
 * when the page tells them which patient they are showing.
 */
export function referenceLink(reference: Reference, patientId?: string): ReferenceLink {
  const parsed = parseReference(reference);
  const text =
    reference.display ||
    (parsed
      ? `${TYPE_NAMES[parsed.type] ?? parsed.type} ${parsed.id}`
      : formatReference(reference));
  const page = parsed && PATIENT_PAGES[parsed.type];
  return page && patientId ? { text, link: ['/patients', patientId, page, parsed.id] } : { text };
}
