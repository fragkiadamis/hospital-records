import { inject, LOCALE_ID, Pipe, PipeTransform } from '@angular/core';
import type { Age, Period, Range } from 'fhir/r4';
import { formatFhirDate } from './fhir-date-pipe';

/** UCUM codes for ages, used when an Age has a code but no human-readable unit. */
const AGE_UNITS: Readonly<Record<string, string>> = {
  a: 'years',
  mo: 'months',
  wk: 'weeks',
  d: 'days',
  h: 'hours',
  min: 'minutes',
};

/** "Jan 2026 – Feb 2026", "since Jan 2026" or "until Feb 2026". */
export function formatPeriod(period: Period | undefined | null, locale: string): string {
  const start = formatFhirDate(period?.start, locale);
  const end = formatFhirDate(period?.end, locale);
  if (start && end) return `${start} – ${end}`;
  if (start) return `since ${start}`;
  if (end) return `until ${end}`;
  return '';
}

/** "45 years", from the Age's unit or, failing that, its UCUM code. */
export function formatAge(age: Age | undefined | null): string {
  if (age?.value === undefined) return '';
  const unit = age.unit ?? AGE_UNITS[age.code ?? ''] ?? age.code ?? '';
  return `${age.value} ${unit}`.trim();
}

/** "40–45 years" (one unit when both ends share it), "from 40 years" or "up to 45 years". */
export function formatRange(range: Range | undefined | null): string {
  const low = formatAge(range?.low);
  const high = formatAge(range?.high);
  if (low && high) {
    const sameUnit =
      range?.low?.unit === range?.high?.unit && range?.low?.code === range?.high?.code;
    return sameUnit ? `${range?.low?.value}–${high}` : `${low} – ${high}`;
  }
  if (low) return `from ${low}`;
  if (high) return `up to ${high}`;
  return '';
}

/** An element with a time choice type such as Condition.onset[x] or Condition.abatement[x]. */
type WithTimeChoice<P extends string> = Partial<
  Record<`${P}DateTime` | `${P}String`, string> &
    Record<`${P}Age`, Age> &
    Record<`${P}Period`, Period> &
    Record<`${P}Range`, Range>
>;

/**
 * Formats whichever variant of a time choice type is present:
 *
 *   onsetDateTime "2025-02-14"                → "14 Feb 2025"
 *   onsetPeriod   { start: "2026-01" }        → "since Jan 2026"
 *   onsetAge      { value: 45, unit: "years" } → "at age 45 years"
 *   onsetRange    40–45 years                 → "at age 40–45 years"
 *   onsetString   "childhood"                 → "childhood"
 */
export function formatTimeChoice<P extends string>(
  element: WithTimeChoice<P> | undefined | null,
  prefix: P,
  locale: string,
): string {
  if (!element) return '';
  const value = (suffix: string) => (element as Record<string, unknown>)[`${prefix}${suffix}`];

  const dateTime = value('DateTime') as string | undefined;
  if (dateTime) return formatFhirDate(dateTime, locale);
  const period = formatPeriod(value('Period') as Period | undefined, locale);
  if (period) return period;
  const age = formatAge(value('Age') as Age | undefined);
  if (age) return `at age ${age}`;
  const range = formatRange(value('Range') as Range | undefined);
  if (range) return `at age ${range}`;
  return (value('String') as string | undefined) ?? '';
}

/** `{{ condition | timeChoice: 'onset' }}` → "14 Feb 2025", "since Jan 2026", "at age 45 years" */
@Pipe({ name: 'timeChoice' })
export class TimeChoicePipe implements PipeTransform {
  private readonly locale = inject(LOCALE_ID);

  transform<P extends string>(element: WithTimeChoice<P> | undefined | null, prefix: P): string {
    return formatTimeChoice(element, prefix, this.locale);
  }
}
