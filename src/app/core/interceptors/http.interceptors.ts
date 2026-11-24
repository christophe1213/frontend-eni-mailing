import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/** Ajoute le jeton JWT à chaque requête */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).token();
  return next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req);
};

/** Déconnecte l'utilisateur quand la session a expiré (401) ; sans effet sur les pages publiques (OTP, etc.) */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && auth.isLoggedIn() && !req.url.endsWith('/auth/login')) auth.logout();
      return throwError(() => err);
    }),
  );
};

/** Message lisible à partir d'une erreur HTTP (format `{ message }` de l'API) */
export function errorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Serveur injoignable. Vérifiez votre connexion.';
    if (err.status === 504 || err.status === 502) return "L'API ne répond pas. Le backend est-il démarré ?";
    const body = err.error;
    if (typeof body?.message === 'string') return body.message;
    // Format FastAPI par défaut : { detail: "..." } ou { detail: [{ msg, loc }] }
    if (typeof body?.detail === 'string') return body.detail;
    if (Array.isArray(body?.detail) && body.detail[0]?.msg) return `Données invalides : ${body.detail[0].msg}`;
    return `Erreur ${err.status}`;
  }
  return 'Une erreur inattendue est survenue.';
}
