import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { FhirClient } from '../../fhir/client/fhir-client';
import { fhirErrorMessage } from '../../fhir/client/fhir-error';
import { EndpointSummary } from '../../fhir/resources/endpoint/endpoint-summary/endpoint-summary';
import { Icon } from '../../shared/icon/icon';

/** How many endpoints the list shows. A hospital has a handful; paging comes if it ever has more. */
const MAX_ENDPOINTS = 100;

@Component({
  imports: [EndpointSummary, Icon, RouterLink],
  selector: 'app-endpoint-list',
  styleUrl: './endpoint-list.scss',
  templateUrl: './endpoint-list.html',
})
export class EndpointList {
  private readonly fhir = inject(FhirClient);

  protected readonly endpoints = rxResource({
    stream: () => this.fhir.search('Endpoint', { _sort: 'name', _count: MAX_ENDPOINTS }),
  });

  protected readonly errorMessage = computed(() => fhirErrorMessage(this.endpoints.error()));
}
