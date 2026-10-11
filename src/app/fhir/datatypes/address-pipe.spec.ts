import { AddressPipe, formatAddress } from './address-pipe';

describe('formatAddress', () => {
  it('joins lines, postcode with city, state and country', () => {
    expect(
      formatAddress({
        line: ['Ermou 12', '3rd floor'],
        postalCode: '105 63',
        city: 'Athens',
        country: 'Greece',
      }),
    ).toBe('Ermou 12, 3rd floor, 105 63 Athens, Greece');
  });

  it('uses the text when the source system gave one', () => {
    expect(formatAddress({ text: 'Ermou 12, Athens', city: 'Athens' })).toBe('Ermou 12, Athens');
  });

  it('skips missing parts', () => {
    expect(formatAddress({ city: 'Athens' })).toBe('Athens');
    expect(formatAddress({})).toBe('');
    expect(formatAddress(undefined)).toBe('');
  });
});

describe('AddressPipe', () => {
  it('formats the address it is given', () => {
    expect(new AddressPipe().transform({ city: 'Patras', country: 'Greece' })).toBe(
      'Patras, Greece',
    );
  });
});
