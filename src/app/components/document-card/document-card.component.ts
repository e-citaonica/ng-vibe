import { Component, Input, inject } from '@angular/core';
import { AngularMaterialModule } from '../../angular-material.module';
import { Document } from '../../model/document.model';
import { SlicePipe } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-document-card',
  standalone: true,
  imports: [AngularMaterialModule, SlicePipe],
  templateUrl: './document-card.component.html'
})
export class DocumentCardComponent {
  @Input('document') document!: Document;

  router = inject(Router);
}
