import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-enter-username-dialog',
  standalone: true,
  imports: [
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
  ],
  templateUrl: './enter-username-dialog.component.html',
  styleUrl: './enter-username-dialog.component.scss',
})
export class EnterUsernameDialogComponent {
  username: string = '';

  constructor(public dialogRef: MatDialogRef<EnterUsernameDialogComponent>) {}
}
