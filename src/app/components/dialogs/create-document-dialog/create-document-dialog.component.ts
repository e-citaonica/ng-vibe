import { Component, inject } from '@angular/core';
import { Constants } from '../../../../constants';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { DocumentService } from '../../../services/document.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-create-document-dialog',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './create-document-dialog.component.html'
})
export class CreateDocumentDialogComponent {
  documentService = inject(DocumentService);
  router = inject(Router);

  languages = Constants.PROGRAMMING_LANGUAGES;

  form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    language: new FormControl(this.languages[0].id, {
      nonNullable: true,
      validators: [Validators.required]
    })
  });

  onConfirm() {
    const { name, language } = this.form.getRawValue();
    this.documentService.create(name, language).subscribe((doc) => {
      this.router.navigate(['/document/' + doc.id]);
    });
  }
}
