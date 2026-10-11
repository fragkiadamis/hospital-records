import { Component, effect, inject, input, output } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import type { Patient } from 'fhir/r4';
import { notInFuture, today } from '../../../../shared/forms/date-validators';
import { PATIENT_IDENTIFIER_TYPES } from '../patient-identifiers';
import { formToPatient, PatientFormValue, patientToForm } from '../patient-mapper';

/** A patient needs at least a given or a family name. */
function nameRequired(group: AbstractControl): ValidationErrors | null {
  const { given, family } = group.value as Pick<PatientFormValue, 'given' | 'family'>;
  return given?.trim() || family?.trim() ? null : { nameRequired: true };
}

/**
 * Create / edit form for a Patient. It saves nothing itself: on submit it emits the Patient
 * built by the mapper, and the page decides whether that is a create or an update.
 */
@Component({
  imports: [ReactiveFormsModule],
  selector: 'app-patient-form',
  templateUrl: './patient-form.html',
})
export class PatientForm {
  /** The stored patient when editing; fields the form doesn't show are kept from it. */
  readonly patient = input<Patient>();
  /** Disables the buttons while the page is saving. */
  readonly saving = input(false);

  readonly save = output<Patient>();
  readonly cancelled = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);

  /** One field per kind of patient identifier (patient-identifiers.json), in its order. */
  protected readonly identifierTypes = PATIENT_IDENTIFIER_TYPES;

  protected readonly form = this.fb.group(
    {
      given: [''],
      family: [''],
      gender: ['' as PatientFormValue['gender']],
      birthDate: ['', notInFuture],
      phone: [''],
      email: ['', Validators.email],
      identifiers: this.fb.record(
        Object.fromEntries(PATIENT_IDENTIFIER_TYPES.map((t) => [t.key, ''])),
      ),
    },
    { validators: nameRequired },
  );

  protected readonly today = today();

  constructor() {
    effect(() => {
      const patient = this.patient();
      if (patient) this.form.reset(patientToForm(patient));
    });
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.save.emit(formToPatient(this.form.getRawValue(), this.patient()));
  }

  /** Show a field's error only once the user has left it (or tried to submit). */
  protected showError(
    field: Exclude<keyof PatientFormValue, 'identifiers'>,
    error: string,
  ): boolean {
    const control = this.form.controls[field];
    return control.touched && control.hasError(error);
  }

  protected get showNameError(): boolean {
    const { given, family } = this.form.controls;
    return (given.touched || family.touched) && this.form.hasError('nameRequired');
  }
}
