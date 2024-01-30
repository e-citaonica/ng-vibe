import { Component, EventEmitter, Output, inject } from '@angular/core';
import { Constants } from '../../../../constants';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { DocumentService } from '../../../services/document.service';
import { Router } from '@angular/router';
import { MatDialogRef } from '@angular/material/dialog';

export interface CreateDocumentModel {
  success: true;
  name: string;
  language: string;
}

@Component({
  selector: 'app-create-document-dialog',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './create-document-dialog.component.html'
})
export class CreateDocumentDialogComponent {
  @Output('onSubmit') onSubmit = new EventEmitter<CreateDocumentModel>();

  documentService = inject(DocumentService);
  router = inject(Router);
  dialogRef = inject(MatDialogRef<CreateDocumentDialogComponent>);

  languages = Constants.PROGRAMMING_LANGUAGES;

  form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    language: new FormControl(this.languages[0].name, {
      nonNullable: true,
      validators: [Validators.required]
    })
  });

  onConfirm() {
    const { name, language } = this.form.getRawValue();
    if (!language || !name) {
      return;
    }
    this.dialogRef.close({ name, language });
  }
}
