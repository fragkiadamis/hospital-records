import { formatDate } from '@angular/common';
import { inject, LOCALE_ID, Pipe, PipeTransform } from '@angular/core';

/**
 * Formats a FHIR `date` or `dateTime`, keeping partial dates partial:
 *
 *   "1968"                       → "1968"
 *   "2019-06"                    → "Jun 2019"       (not "1 Jun 2019")
 *   "1968-04-12"                 → "12 Apr 1968"
 *   "2025-02-10T09:30:00+02:00"  → "10 Feb 2025, 07:30" in the given time zone (default: the browser's)
 *
 * Anything else is returned unchanged, so bad data stays visible instead of turning into a wrong date.
 */
export function formatFhirDate(
  value: string | undefined | null,
  locale: string,
  timezone?: string,
): string {
  if (!value) return '';
  if (/^\d{4}$/.test(value)) return value;
  // Angular reads date-only strings as local calendar dates, so these never shift by a day.
  if (/^\d{4}-\d{2}$/.test(value)) return formatDate(value, 'MMM y', locale);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value, 'd MMM y', locale);
  if (isNaN(Date.parse(value))) return value;
  return formatDate(value, 'd MMM y, HH:mm', locale, timezone);
}

/** `{{ patient.birthDate | fhirDate }}`, or `| fhirDate: 'UTC'` to fix the time zone of a dateTime. */
@Pipe({ name: 'fhirDate' })
export class FhirDatePipe implements PipeTransform {
  private readonly locale = inject(LOCALE_ID);

  transform(value: string | undefined | null, timezone?: string): string {
    return formatFhirDate(value, this.locale, timezone);
  }
}
