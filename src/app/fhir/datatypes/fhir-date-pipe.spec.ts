import { TestBed } from '@angular/core/testing';
import { FhirDatePipe, formatFhirDate } from './fhir-date-pipe';

describe('formatFhirDate', () => {
  const format = (value: string | undefined, timezone?: string) =>
    formatFhirDate(value, 'en-US', timezone);

  it('keeps partial dates partial', () => {
    expect(format('1968')).toBe('1968');
    expect(format('2019-06')).toBe('Jun 2019');
  });

  it('formats a full date without shifting the day', () => {
    expect(format('1968-04-12')).toBe('12 Apr 1968');
    expect(format('2026-01-01')).toBe('1 Jan 2026');
  });

  it('formats a dateTime in the requested time zone', () => {
    expect(format('2025-02-10T09:30:00+02:00', 'UTC')).toBe('10 Feb 2025, 07:30');
    expect(format('2025-02-10T09:30:00+02:00', '+0200')).toBe('10 Feb 2025, 09:30');
  });

  it('returns unparseable values unchanged and empty values as an empty string', () => {
    expect(format('sometime in spring')).toBe('sometime in spring');
    expect(format('')).toBe('');
    expect(format(undefined)).toBe('');
  });
});

describe('FhirDatePipe', () => {
  it('formats with the app locale', () => {
    const pipe = TestBed.runInInjectionContext(() => new FhirDatePipe());
    expect(pipe.transform('1968-04-12')).toBe('12 Apr 1968');
  });
});
