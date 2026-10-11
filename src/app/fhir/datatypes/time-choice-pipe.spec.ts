import { TestBed } from '@angular/core/testing';
import type { Condition } from 'fhir/r4';
import {
  formatAge,
  formatPeriod,
  formatRange,
  formatTimeChoice,
  TimeChoicePipe,
} from './time-choice-pipe';

const condition = (fields: Partial<Condition>): Condition => ({
  resourceType: 'Condition',
  subject: { reference: 'Patient/p1' },
  ...fields,
});

describe('formatPeriod', () => {
  it('shows both ends, or says since / until when one is open', () => {
    expect(formatPeriod({ start: '2026-01', end: '2026-02-20' }, 'en-US')).toBe(
      'Jan 2026 – 20 Feb 2026',
    );
    expect(formatPeriod({ start: '2026-01' }, 'en-US')).toBe('since Jan 2026');
    expect(formatPeriod({ end: '2026' }, 'en-US')).toBe('until 2026');
    expect(formatPeriod({}, 'en-US')).toBe('');
  });
});

describe('formatAge', () => {
  it('uses the unit, or the UCUM code when there is no unit', () => {
    expect(formatAge({ value: 45, unit: 'years' })).toBe('45 years');
    expect(formatAge({ value: 6, code: 'mo', system: 'http://unitsofmeasure.org' })).toBe(
      '6 months',
    );
    expect(formatAge({ unit: 'years' })).toBe('');
  });
});

describe('formatRange', () => {
  it('names the unit once when both ends share it', () => {
    expect(
      formatRange({ low: { value: 40, unit: 'years' }, high: { value: 45, unit: 'years' } }),
    ).toBe('40–45 years');
  });

  it('handles different units and open ends', () => {
    expect(
      formatRange({ low: { value: 6, unit: 'months' }, high: { value: 2, unit: 'years' } }),
    ).toBe('6 months – 2 years');
    expect(formatRange({ low: { value: 40, unit: 'years' } })).toBe('from 40 years');
    expect(formatRange({ high: { value: 45, unit: 'years' } })).toBe('up to 45 years');
  });
});

describe('formatTimeChoice', () => {
  const onset = (fields: Partial<Condition>) =>
    formatTimeChoice(condition(fields), 'onset', 'en-US');

  it('formats whichever onset variant is present', () => {
    expect(onset({ onsetDateTime: '2025-02-14' })).toBe('14 Feb 2025');
    expect(onset({ onsetPeriod: { start: '2026-01-08' } })).toBe('since 8 Jan 2026');
    expect(onset({ onsetAge: { value: 45, unit: 'years' } })).toBe('at age 45 years');
    expect(
      onset({
        onsetRange: { low: { value: 40, unit: 'years' }, high: { value: 45, unit: 'years' } },
      }),
    ).toBe('at age 40–45 years');
    expect(onset({ onsetString: 'childhood' })).toBe('childhood');
    expect(onset({})).toBe('');
  });

  it('works for abatement too', () => {
    expect(
      formatTimeChoice(condition({ abatementDateTime: '2026-02-20' }), 'abatement', 'en-US'),
    ).toBe('20 Feb 2026');
  });
});

describe('TimeChoicePipe', () => {
  it('formats with the app locale', () => {
    const pipe = TestBed.runInInjectionContext(() => new TimeChoicePipe());
    expect(pipe.transform(condition({ onsetDateTime: '2019-06' }), 'onset')).toBe('Jun 2019');
  });
});
