import { HttpHeaders } from '@angular/common/http';

export namespace Constants {
  export const API_URL = 'http://localhost:3333/api';
  export const HTTP_OPTIONS = {
    headers: new HttpHeaders({
      'Content-Type': 'application/json',
    }),
  };
}
