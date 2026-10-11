import type { CodeableConcept, Coding, Condition, Reference } from 'fhir/r4';
import { CodeSystems } from '../../code-systems';
import { findCoding, formatCodeableConcept } from '../../datatypes/codeable-concept-pipe';
import { replaceEntry } from '../replace-entry';

/** HL7 condition-clinical codes, with the labels the app shows for them. */
export const CLINICAL_STATUSES = {
  active: 'Active',
  recurrence: 'Recurrence',
  relapse: 'Relapse',
  inactive: 'Inactive',
  remission: 'Remission',
  resolved: 'Resolved',
} as const;

/** HL7 condition-ver-status codes. */
export const VERIFICATION_STATUSES = {
  unconfirmed: 'Unconfirmed',
  provisional: 'Provisional',
  differential: 'Differential',
  confirmed: 'Confirmed',
  refuted: 'Refuted',
  'entered-in-error': 'Entered in error',
} as const;

/** HL7 condition-category codes. */
export const CONDITION_CATEGORIES = {
  'problem-list-item': 'Problem list item',
  'encounter-diagnosis': 'Encounter diagnosis',
} as const;

export type ClinicalStatus = keyof typeof CLINICAL_STATUSES;
export type VerificationStatus = keyof typeof VERIFICATION_STATUSES;
export type ConditionCategory = keyof typeof CONDITION_CATEGORIES;

/** What the condition form edits: flat fields, '' when empty. */
export interface ConditionFormValue {
  text: string; // the condition's name, as the user calls it
  snomedCode: string;
  snomedDisplay: string;
  icd10Code: string;
  icd10Display: string;
  clinicalStatus: ClinicalStatus | '';
  verificationStatus: VerificationStatus | '';
  category: ConditionCategory | '';
  onsetDate: string; // YYYY-MM-DD
  abatementDate: string; // YYYY-MM-DD
}

/** The code of a status or category concept from the given HL7 code system, or ''. */
function codeIn<T extends string>(concept: CodeableConcept | undefined, system: string): T | '' {
  return (findCoding(concept, system)?.code as T | undefined) ?? '';
}

export const clinicalStatusOf = (c: Condition) =>
  codeIn<ClinicalStatus>(c.clinicalStatus, CodeSystems.conditionClinical);

export const verificationStatusOf = (c: Condition) =>
  codeIn<VerificationStatus>(c.verificationStatus, CodeSystems.conditionVerification);

const categoryCoding = (concept: CodeableConcept) =>
  findCoding(concept, CodeSystems.conditionCategory);

/** Condition → form. Onset/abatement show only dates; ages, periods and text stay as stored. */
export function conditionToForm(condition: Condition): ConditionFormValue {
  const snomed = findCoding(condition.code, CodeSystems.snomed);
  const icd10 = findCoding(condition.code, CodeSystems.icd10);
  const category = condition.category?.map(categoryCoding).find(Boolean);
  return {
    text: condition.code?.text ?? '',
    snomedCode: snomed?.code ?? '',
    snomedDisplay: snomed?.display ?? '',
    icd10Code: icd10?.code ?? '',
    icd10Display: icd10?.display ?? '',
    clinicalStatus: clinicalStatusOf(condition),
    verificationStatus: verificationStatusOf(condition),
    category: (category?.code as ConditionCategory | undefined) ?? '',
    onsetDate: condition.onsetDateTime ?? '',
    abatementDate: condition.abatementDateTime ?? '',
  };
}

/**
 * Form → Condition. `subject` is the patient for a new condition; an existing condition keeps
 * its own. As with patients, everything the form doesn't edit is copied from `existing`, and
 * only the codings, statuses and dates the form shows are replaced.
 */
export function formToCondition(
  value: ConditionFormValue,
  subject: Reference,
  existing?: Condition,
): Condition {
  return {
    ...existing,
    resourceType: 'Condition',
    subject: existing?.subject ?? subject,
    code: editedCode(value, existing?.code),
    clinicalStatus: statusConcept(
      CodeSystems.conditionClinical,
      value.clinicalStatus,
      existing?.clinicalStatus,
    ),
    verificationStatus: statusConcept(
      CodeSystems.conditionVerification,
      value.verificationStatus,
      existing?.verificationStatus,
    ),
    category: editedCategories(value.category, existing?.category),
    ...timeChoice('onset', value.onsetDate, existing),
    ...timeChoice('abatement', value.abatementDate, existing),
  };
}

/** "Breast cancer", from the code's text or a coding's display, else the resource reference. */
export function conditionDisplayName(condition: Condition): string {
  return (
    formatCodeableConcept(condition.code, CodeSystems.snomed) ||
    `Condition/${condition.id ?? 'new'}`
  );
}

/** Condition.code with the form's text and its SNOMED and ICD-10 codings; other codings stay. */
function editedCode(value: ConditionFormValue, current?: CodeableConcept) {
  const coding = [CodeSystems.snomed, CodeSystems.icd10].reduce((list, system) => {
    const isSnomed = system === CodeSystems.snomed;
    const code = (isSnomed ? value.snomedCode : value.icd10Code).trim();
    const display = (isSnomed ? value.snomedDisplay : value.icd10Display).trim();
    const old = findCoding(current, system);
    const next: Coding | undefined = code
      ? { ...(old?.code === code ? old : {}), system, code, display: display || undefined }
      : undefined;
    return replaceEntry(list, old, next);
  }, current?.coding);
  const text = value.text.trim();
  if (!coding?.length && !text) return undefined;
  return { ...current, coding, text: text || undefined };
}

/** A status concept for `code`; the stored one is kept as is when its code didn't change. */
function statusConcept(system: string, code: string, current?: CodeableConcept) {
  if (!code) return undefined;
  if (findCoding(current, system)?.code === code) return current;
  return { coding: [{ system, code }] };
}

/** Condition.category with the form's category in place of the stored HL7 one; others stay. */
function editedCategories(code: string, current?: CodeableConcept[]) {
  const old = current?.find((c) => categoryCoding(c));
  const next =
    old && categoryCoding(old)?.code === code
      ? old
      : code
        ? { coding: [{ system: CodeSystems.conditionCategory, code }] }
        : undefined;
  return replaceEntry(current, old, next);
}

/**
 * The fields of a time choice type (onset[x], abatement[x]) after the form's date: a date
 * replaces whatever variant was stored; no date keeps a stored age, period, range or text.
 */
function timeChoice(prefix: 'onset' | 'abatement', date: string, existing?: Condition) {
  const variants = ['DateTime', 'Age', 'Period', 'Range', 'String'].map((v) => `${prefix}${v}`);
  const fields: Record<string, unknown> = Object.fromEntries(variants.map((f) => [f, undefined]));
  if (date) return { ...fields, [`${prefix}DateTime`]: date };
  for (const field of variants.slice(1)) {
    fields[field] = existing?.[field as keyof Condition];
  }
  return fields;
}
