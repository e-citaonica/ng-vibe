import { Component, inject } from '@angular/core';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AngularMaterialModule } from '../../angular-material.module';
import { FormGroup, FormControl } from '@angular/forms';
import { noWhitespaceValidator } from '../../validators/noWhitespaceValidator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

interface JoinDocumentForm {
  username: FormControl<string>;
  document: FormControl<string>;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    RouterModule,
    AngularMaterialModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  router = inject(Router);
  fb = inject(FormBuilder);

  form = this.fb.group<JoinDocumentForm>({
    username: this.fb.nonNullable.control('', {
      validators: [Validators.required, noWhitespaceValidator],
    }),
    document: this.fb.nonNullable.control('', {
      validators: [Validators.required, noWhitespaceValidator],
    }),
  });

  setUsername() {
    if (!this.form.value) {
      alert('Enter username.');
    }

    localStorage.setItem('user', this.form.value.username!);
    this.router.navigate(['/home']);
  }

  onSubmit() {}
}
