import { AbstractControl, ValidationErrors } from '@angular/forms';

/** Today as YYYY-MM-DD in the user's time zone, the format of <input type="date">. */
export function today(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** For date fields that record something that already happened: `{ future: true }` otherwise. */
export function notInFuture(control: AbstractControl<string>): ValidationErrors | null {
  return control.value && control.value > today() ? { future: true } : null;
}
