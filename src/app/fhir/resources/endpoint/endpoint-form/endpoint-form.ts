import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import type { Endpoint } from 'fhir/r4';
import {
  CONNECTION_TYPES,
  connectionTypeName,
  ENDPOINT_STATUSES,
  EndpointFormValue,
  endpointToForm,
  formToEndpoint,
  NEW_ENDPOINT_FORM,
} from '../endpoint-mapper';

/**
 * An endpoint's address must be an absolute URL with its scheme: "scheme://…" (http, https,
 * mllp, …), or a mailto: / urn: address. `new URL()` alone isn't enough: it reads
 * "localhost:8042/dicom-web" as the scheme "localhost:".
 */
function absoluteUrl(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  if (!value) return null;
  if (!/^([a-z][a-z0-9+.-]*:\/\/|mailto:|urn:)/i.test(value)) return { url: true };
  try {
    new URL(value);
    return null;
  } catch {
    return { url: true };
  }
}

/**
 * Create / edit form for an Endpoint. It saves nothing itself: on submit it emits the Endpoint
 * built by the mapper, and the page decides whether that is a create or an update.
 */
@Component({
  imports: [ReactiveFormsModule],
  selector: 'app-endpoint-form',
  templateUrl: './endpoint-form.html',
})
export class EndpointForm {
  /** The stored endpoint when editing; fields the form doesn't show are kept from it. */
  readonly endpoint = input<Endpoint>();
  /** Disables the buttons while the page is saving. */
  readonly saving = input(false);

  readonly save = output<Endpoint>();
  readonly cancelled = output<void>();

  protected readonly statuses = Object.entries(ENDPOINT_STATUSES).map(([code, label]) => ({
    code,
    label,
  }));

  /** A stored connection type the app doesn't offer, so the select can still show it. */
  private readonly storedType = signal<{ code: string; label: string } | undefined>(undefined);
  protected readonly connectionTypes = computed(() => {
    const offered = Object.entries(CONNECTION_TYPES).map(([code, label]) => ({ code, label }));
    const stored = this.storedType();
    return stored && !offered.some((t) => t.code === stored.code) ? [...offered, stored] : offered;
  });

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [NEW_ENDPOINT_FORM.name],
    status: [NEW_ENDPOINT_FORM.status as EndpointFormValue['status']],
    connectionType: [NEW_ENDPOINT_FORM.connectionType, Validators.required],
    address: [NEW_ENDPOINT_FORM.address, [Validators.required, absoluteUrl]],
    payloadType: [NEW_ENDPOINT_FORM.payloadType, Validators.required],
    payloadMimeTypes: [NEW_ENDPOINT_FORM.payloadMimeTypes],
  });

  constructor() {
    effect(() => {
      const endpoint = this.endpoint();
      if (!endpoint) return;
      const code = endpoint.connectionType?.code;
      this.storedType.set(
        code ? { code, label: connectionTypeName(endpoint.connectionType) } : undefined,
      );
      this.form.reset(endpointToForm(endpoint));
    });
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.save.emit(formToEndpoint(this.form.getRawValue(), this.endpoint()));
  }

  /** Show a field's error only once the user has left it (or tried to submit). */
  protected showError(field: keyof EndpointFormValue, error: string): boolean {
    const control = this.form.controls[field];
    return control.touched && control.hasError(error);
  }
}
