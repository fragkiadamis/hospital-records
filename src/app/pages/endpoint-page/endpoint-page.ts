import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { FhirClient } from '../../fhir/client/fhir-client';
import { fhirErrorMessage } from '../../fhir/client/fhir-error';
import { DeletePanel } from '../../fhir/delete-panel/delete-panel';
import { EndpointDetail } from '../../fhir/resources/endpoint/endpoint-detail/endpoint-detail';
import { endpointDisplayName } from '../../fhir/resources/endpoint/endpoint-mapper';
import { Icon } from '../../shared/icon/icon';

@Component({
  imports: [DeletePanel, EndpointDetail, Icon, RouterLink],
  selector: 'app-endpoint-page',
  templateUrl: './endpoint-page.html',
})
export class EndpointPage {
  private readonly fhir = inject(FhirClient);
  private readonly router = inject(Router);

  /** From the route, /endpoints/:id (router input binding). */
  readonly id = input.required<string>();

  protected readonly endpoint = rxResource({
    params: () => this.id(),
    stream: ({ params: id }) => this.fhir.read('Endpoint', id),
  });

  protected readonly errorMessage = computed(() => fhirErrorMessage(this.endpoint.error()));
  protected readonly name = computed(() =>
    this.endpoint.hasValue() ? endpointDisplayName(this.endpoint.value()) : '',
  );

  /** Whether the delete panel is open; it is two-way bound to the panel's `open`. */
  protected readonly deleting = signal(false);

  constructor() {
    const title = inject(Title);
    effect(() => {
      if (this.name()) title.setTitle(`${this.name()} · Hospital Records`);
    });
  }

  protected onDeleted(): void {
    this.router.navigate(['/endpoints']);
  }
}
