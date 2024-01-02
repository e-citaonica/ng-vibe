import { FormsModule } from '@angular/forms';
import { Component, effect, signal } from '@angular/core';
import { CodemirrorModule } from '@ctrl/ngx-codemirror';
import { Document } from './document.model';

@Component({
  selector: 'app-document',
  standalone: true,
  imports: [FormsModule, CodemirrorModule],
  templateUrl: './document.component.html',
  styleUrl: './document.component.scss',
})
export class DocumentComponent {
  doc = {
    id: '1',
    content: 'content',
    name: 'Document 1',
    revision: 1,
  };

  readonly content = signal(this.doc.content);

  constructor() {
    effect(() => {
      console.log(this.content());
    });
  }
}
