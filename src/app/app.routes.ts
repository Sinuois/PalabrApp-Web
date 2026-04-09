import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';

const palabraGuard: CanActivateFn = () => {
  const router = inject(Router);
  // nav.id === 1 means it's the very first navigation → direct URL access
  if (router.getCurrentNavigation()?.id === 1) {
    return router.createUrlTree(['/']);
  }
  return true;
};

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/home/home.component').then(m => m.HomeComponent)
  },
  {
    path: 'buscar',
    loadComponent: () =>
      import('./pages/buscar/buscar.component').then(m => m.BuscarComponent)
  },
  {
    path: 'palabra/:id',
    canActivate: [palabraGuard],
    loadComponent: () =>
      import('./pages/palabra/palabra.component').then(m => m.PalabraComponent)
  },
  {
    path: '**',
    redirectTo: ''
  }
];