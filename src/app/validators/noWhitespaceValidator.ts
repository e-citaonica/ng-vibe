import { AbstractControl, FormControl } from '@angular/forms';

export function noWhitespaceValidator(control: AbstractControl<string>) {
  const isWhitespace = (control.value || '').trim().length === 0;
  return !isWhitespace ? null : { whitespace: true };
}
