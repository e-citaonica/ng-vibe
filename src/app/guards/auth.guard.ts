import { of } from 'rxjs';
import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';

export const authGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);

  const userString = window.localStorage.getItem('user');

  if (userString == null) {
    router.navigate(['/login']);

    return of(false);
  }

  return of(true);
};
