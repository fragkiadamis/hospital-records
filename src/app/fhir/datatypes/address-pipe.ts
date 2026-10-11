import { Pipe, PipeTransform } from '@angular/core';
import type { Address } from 'fhir/r4';

/** One line: the address `text` if given, else "Lines, Postcode City, State, Country". */
export function formatAddress(address: Address | undefined | null): string {
  if (!address) return '';
  if (address.text) return address.text;
  const cityLine = [address.postalCode, address.city].filter(Boolean).join(' ');
  return [...(address.line ?? []), cityLine, address.state, address.country]
    .filter(Boolean)
    .join(', ');
}

/** `{{ patient.address[0] | address }}` → "Ermou 12, 105 63 Athens, Greece" */
@Pipe({ name: 'address' })
export class AddressPipe implements PipeTransform {
  transform(address: Address | undefined | null): string {
    return formatAddress(address);
  }
}
