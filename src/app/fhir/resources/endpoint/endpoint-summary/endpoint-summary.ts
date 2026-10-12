import { Component, computed, input } from '@angular/core';
import type { Endpoint } from 'fhir/r4';
import { Icon } from '../../../../shared/icon/icon';
import { connectionTypeName, endpointDisplayName, ENDPOINT_STATUSES } from '../endpoint-mapper';

/**
 * One-line endpoint: name, connection type, address, and its status as a tag. Display only; wrap
 * it in a link where it should be clickable.
 */
@Component({
  imports: [Icon],
  selector: 'app-endpoint-summary',
  styleUrl: './endpoint-summary.scss',
  templateUrl: './endpoint-summary.html',
})
export class EndpointSummary {
  readonly endpoint = input.required<Endpoint>();

  protected readonly name = computed(() => endpointDisplayName(this.endpoint()));
  protected readonly connectionType = computed(() =>
    connectionTypeName(this.endpoint().connectionType),
  );
  protected readonly status = computed(() => this.endpoint().status);
  protected readonly statusLabel = computed(
    () => ENDPOINT_STATUSES[this.status()] ?? this.status(),
  );
}
