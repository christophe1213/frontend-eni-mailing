import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Role } from '../models';
import { AuthService } from '../services/auth.service';

/** Page accessible uniquement connecté */
export const authGuard: CanActivateFn = (_route, state) =>
  inject(AuthService).isLoggedIn()
  || inject(Router).createUrlTree(['/login'], {
    queryParams: state.url === '/' ? {} : { returnUrl: state.url },
  });

/** Page accessible uniquement non connecté (connexion, mot de passe oublié) */
export const guestGuard: CanActivateFn = () =>
  !inject(AuthService).isLoggedIn() || inject(Router).createUrlTree(['/mail/inbox']);

/** Rôle minimal requis, ex. `canActivate: [roleGuard('PERSONNEL')]` */
export const roleGuard = (min: Role): CanActivateFn => () =>
  inject(AuthService).hasRole(min) || inject(Router).createUrlTree(['/mail/inbox']);
