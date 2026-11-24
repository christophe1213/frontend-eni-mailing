import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { map, Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  LoginResponse, OtpPurpose, OtpResponse, RegisterPayload, RegisterResponse, Role, ROLE_RANK, User, VerifyResetOtpResponse,
} from '../models';

const TOKEN_KEY = 'eni-mail-token';
const USER_KEY = 'eni-mail-user';

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private api = `${environment.apiUrl}/auth`;

  private readonly _token = signal<string | null>(read(TOKEN_KEY));
  private readonly _user = signal<User | null>(JSON.parse(read(USER_KEY) ?? 'null'));

  readonly token = this._token.asReadonly();
  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => !!this._token());
  readonly isAdmin = computed(() => this._user()?.role === 'ADMIN');

  /** Vrai si l'utilisateur a au moins le rôle `min` (ADMIN ⊃ PERSONNEL ⊃ ENSEIGNANT ⊃ ETUDIANT) */
  hasRole(min: Role): boolean {
    const u = this._user();
    return !!u && ROLE_RANK[u.role] >= ROLE_RANK[min];
  }

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.api}/login`, { email, password }).pipe(
      tap(({ token, user }) => {
        this._token.set(token);
        this.setUser(user);
        try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignoré */ }
      }),
    );
  }

  /**
   * Demande d'inscription : un code OTP est envoyé à `emailVerification`.
   * Le compte reste inactif jusqu'à la validation de l'e-mail puis par l'administrateur.
   */
  register(payload: RegisterPayload): Observable<RegisterResponse> {
    return this.http.post<RegisterResponse>(`${this.api}/register`, payload);
  }

  /** Valide le code reçu par e-mail (inscription ou réinitialisation) */
  verifyOtp(email: string, code: string, purpose: OtpPurpose = 'REGISTER'): Observable<OtpResponse> {
    return this.http.post<OtpResponse>(`${this.api}/verify-otp`, { email, code, purpose });
  }

  /** Renvoie un code (le backend impose 60 s entre deux envois : erreur 429 sinon) */
  resendOtp(email: string, purpose: OtpPurpose = 'REGISTER'): Observable<OtpResponse> {
    return this.http.post<OtpResponse>(`${this.api}/resend-otp`, { email, purpose });
  }

  /** Étape 1 du mot de passe oublié : la réponse est volontairement identique que le compte existe ou non */
  forgotPassword(email: string): Observable<OtpResponse> {
    return this.http.post<OtpResponse>(`${this.api}/forgot-password`, { email });
  }

  /**
   * Étape 2 : vérifie le code et renvoie le jeton de réinitialisation.
   * Le backend renvoie `reset_token` ; on accepte aussi `resetToken` (selon l'alias des schémas Pydantic).
   */
  verifyResetOtp(email: string, code: string): Observable<VerifyResetOtpResponse> {
    return this.http
      .post<OtpResponse & { resetToken?: string; reset_token?: string }>(`${this.api}/verify-reset-otp`, { email, code })
      .pipe(map((r) => ({ success: r.success, message: r.message, resetToken: r.resetToken ?? r.reset_token ?? '' })));
  }

  /** Étape 3 : définit le nouveau mot de passe */
  resetPassword(email: string, resetToken: string, newPassword: string): Observable<OtpResponse> {
    return this.http.post<OtpResponse>(`${this.api}/reset-password`, { email, resetToken, newPassword });
  }

  refreshMe(): Observable<User> {
    return this.http.get<User>(`${this.api}/me`).pipe(tap((u) => this.setUser(u)));
  }

  updateMe(data: Partial<User>): Observable<User> {
    return this.http.put<User>(`${this.api}/me`, data).pipe(tap((u) => this.setUser(u)));
  }

  /** Envoie la nouvelle photo de profil (multipart, champ « file ») */
  uploadAvatar(file: Blob): Observable<User> {
    const form = new FormData();
    form.append('file', file, 'avatar.jpg');
    return this.http.post<User>(`${this.api}/me/avatar`, form).pipe(tap((u) => this.setUser(u)));
  }

  removeAvatar(): Observable<User> {
    return this.http.delete<User>(`${this.api}/me/avatar`).pipe(tap((u) => this.setUser(u)));
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${this.api}/change-password`, { currentPassword, newPassword });
  }

  logout(): void {
    this._token.set(null);
    this._user.set(null);
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch { /* ignoré */ }
    this.router.navigate(['/login']);
  }

  private setUser(u: User): void {
    this._user.set(u);
    try { localStorage.setItem(USER_KEY, JSON.stringify(u)); } catch { /* ignoré */ }
  }
}
