import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Constants } from '../../constants';
import { Observable } from 'rxjs';
import { Document } from '../model/document.model';

@Injectable({
  providedIn: 'root',
})
export class DocumentService {
  http = inject(HttpClient);

  get(docId: string): Observable<Document> {
    return this.http.get<Document>(`${Constants.API_URL}/document/${docId}`);
  }
}
