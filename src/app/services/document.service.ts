import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Constants } from '../../constants';
import { Observable } from 'rxjs';
import { Document } from '../model/document.model';

@Injectable({
  providedIn: 'root'
})
export class DocumentService {
  private http = inject(HttpClient);

  get(docId: string): Observable<Document> {
    return this.http.get<Document>(`${Constants.API_URL}/document/${docId}`);
  }

  getAll() {
    return this.http.get<Document[]>(`${Constants.API_URL}/document`);
  }

  create(name: string, language: string) {
    return this.http.post<Document>(
      `${Constants.API_URL}/document`,
      { name, language },
      Constants.HTTP_OPTIONS
    );
  }
}
