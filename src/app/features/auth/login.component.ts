import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { errorMessage } from '../../core/interceptors/http.interceptors';
import { AuthService } from '../../core/services/auth.service';
import { IconComponent } from '../../shared/icon.component';

@Component({
  selector: 'app-login',
  imports: [IconComponent, ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.component.html',
  styleUrl: './auth.scss',
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  readonly loading = signal(false);
  readonly error = signal('');
  /** Connexion refusée car l'e-mail de vérification n'a pas encore été confirmé par code OTP */
  readonly needsVerification = signal(false);
  readonly showPassword = signal(false);

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.needsVerification.set(false);
    const { email, password } = this.form.getRawValue();
    this.auth.login(email, password).subscribe({
      next: () => this.router.navigateByUrl(this.route.snapshot.queryParamMap.get('returnUrl') ?? '/mail/inbox'),
      error: (e) => {
        this.error.set(errorMessage(e));
        // À adapter au message exact renvoyé par auth_service.authenticate pour un compte non vérifié (403)
        this.needsVerification.set(e instanceof HttpErrorResponse && e.status === 403 && /\bOTP\b/.test(this.error()));
        this.loading.set(false);
      },
    });
  }
}
