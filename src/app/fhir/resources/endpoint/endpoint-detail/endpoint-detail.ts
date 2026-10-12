import { Component, computed, input } from '@angular/core';
import type { Endpoint } from 'fhir/r4';
import { FhirDatePipe } from '../../../datatypes/fhir-date-pipe';
import { formatCodeableConcept } from '../../../datatypes/codeable-concept-pipe';
import { identifierLabel } from '../../../datatypes/identifier-pipe';
import { Icon } from '../../../../shared/icon/icon';
import {
  connectionTypeName,
  endpointDisplayName,
  ENDPOINT_STATUSES,
  isPacsEndpoint,
} from '../endpoint-mapper';

/** Everything on an Endpoint record, read-only. Shows all entries, not only those the form edits. */
@Component({
  imports: [FhirDatePipe, Icon],
  selector: 'app-endpoint-detail',
  styleUrl: './endpoint-detail.scss',
  templateUrl: './endpoint-detail.html',
})
export class EndpointDetail {
  readonly endpoint = input.required<Endpoint>();

  protected readonly name = computed(() => endpointDisplayName(this.endpoint()));
  protected readonly connectionType = computed(() =>
    connectionTypeName(this.endpoint().connectionType),
  );
  protected readonly status = computed(() => ENDPOINT_STATUSES[this.endpoint().status]);
  protected readonly isPacs = computed(() => isPacsEndpoint(this.endpoint()));

  /** The address as a link only when it is a web address; anything else is shown as text. */
  protected readonly webAddress = computed(() =>
    /^https?:\/\//i.test(this.endpoint().address ?? '') ? this.endpoint().address : '',
  );

  protected readonly payloadTypes = computed(() =>
    (this.endpoint().payloadType ?? []).map((type) => formatCodeableConcept(type)).filter(Boolean),
  );

  protected readonly identifiers = computed(() =>
    (this.endpoint().identifier ?? []).map((identifier) => ({
      label: identifierLabel(identifier),
      value: identifier.value ?? '',
    })),
  );
}
