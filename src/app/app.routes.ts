import { Routes } from '@angular/router';
import { NavigationComponent } from './navigation/navigation.component';
import { HomeComponent } from './home/home.component';
import { LoginComponent } from './users/login/login.component';
import { DocumentComponent } from './document/document.component';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  {
    path: '',
    component: NavigationComponent,
    // canActivate: [authGuard],
    children: [
      { path: 'home', component: HomeComponent },
      { path: 'document/:id', component: DocumentComponent },
    ],
  },
  { path: 'login', component: LoginComponent },
  {
    path: '**',
    redirectTo: 'home',
  },
];
