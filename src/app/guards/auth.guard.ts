import { of } from 'rxjs';
import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import {
  UsernameInputDialogComponent,
  UsernameInputDialogData
} from '../components/dialogs/username-input-dialog/username-input-dialog.component';

export const authGuard: CanActivateFn = (route, state) => {
  const dialog = inject(MatDialog);

  const user = window.localStorage.getItem('user');

  if (user == null) {
    dialog
      .open(UsernameInputDialogComponent)
      .afterClosed()
      .subscribe((data: UsernameInputDialogData) => {
        localStorage.setItem('user', data.username);
      });
  }

  return of(true);
};
