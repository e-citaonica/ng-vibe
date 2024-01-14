import { HttpHeaders } from '@angular/common/http';

export namespace Constants {
  // export const API_URL = 'https://vibe.ecitaonica.rs:2087';
  // export const WS_URL = 'wss://vibe.ecitaonica.rs:2087';
  export const API_URL = 'http://localhost:8080';
  export const WS_URL = 'ws://localhost:8079';
  export const HTTP_OPTIONS = {
    headers: new HttpHeaders({
      'Content-Type': 'application/json',
    }),
  };
}
