import { Routes } from '@angular/router';
import { NavigationComponent } from './navigation/navigation.component';
import { HomeComponent } from './pages/home/home.component';
import { authGuard } from './guards/auth.guard';
import { DocumentComponent } from './pages/document/document.component';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  {
    path: '',
    component: NavigationComponent,
    canActivate: [authGuard],
    children: [
      { path: 'home', component: HomeComponent },
      { path: 'document/:id', component: DocumentComponent },
    ],
  },
  {
    path: '**',
    redirectTo: 'home',
  },
];
