import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterModule],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  router = inject(Router);

  username: string | null = null;

  setUsername() {
    if (!this.username) {
      alert('Enter username.');
    }

    localStorage.setItem('user', this.username!);
    this.router.navigate(['/home']);
  }
}
