import { Component } from '@angular/core';
import { AngularMaterialModule } from '../../angular-material.module';

@Component({
  selector: 'app-document-card',
  standalone: true,
  imports: [AngularMaterialModule],
  templateUrl: './document-card.component.html',
  styleUrl: './document-card.component.scss',
})
export class DocumentCardComponent {}
