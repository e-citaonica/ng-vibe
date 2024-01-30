import { Component } from '@angular/core';
import {
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';

export interface UsernameInputDialogData {
  username: string;
}

@Component({
  selector: 'app-enter-username-dialog',
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule],
  templateUrl: './username-input-dialog.component.html'
})
export class UsernameInputDialogComponent {
  form = new FormGroup({
    username: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    })
  });

  constructor(public dialogRef: MatDialogRef<UsernameInputDialogComponent>) {
    dialogRef.disableClose = true;
  }

  onSubmit() {
    const username = this.form.value.username?.trim();
    if (username) {
      this.dialogRef.close({ username: username });
    }
  }
}
