import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal
} from '@angular/core';
import { Document } from '../../model/document.model';
import { DocumentCardComponent } from '../../components/document-card/document-card.component';
import { DocumentService } from '../../services/document.service';
import { MatDialog } from '@angular/material/dialog';
import { CreateDocumentDialogComponent } from '../../components/dialogs/create-document-dialog/create-document-dialog.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [DocumentCardComponent],
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomeComponent {
  documents = signal<Document[]>([
    {
      id: 'id',
      content: 'content',
      name: 'name 1',
      revision: 1
    },
    {
      id: 'id',
      content: 'content',
      name: 'name 2',
      revision: 1
    },
    {
      id: 'id',
      content: 'content',
      name: 'name 3',
      revision: 1
    },
    {
      id: 'id',
      content: 'content',
      name: 'name 4',
      revision: 1
    },
    {
      id: 'id',
      content: 'content',
      name: 'name 5',
      revision: 1
    }
  ]);

  documentService = inject(DocumentService);
  matDialog = inject(MatDialog);

  constructor() {
    this.documentService.getAll().subscribe((docs) => this.documents.set(docs));
  }

  openCreateDocumentDialog() {
    this.matDialog.open(CreateDocumentDialogComponent);
  }
}
