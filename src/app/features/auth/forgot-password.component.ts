import { ChangeDetectionStrategy, Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { errorMessage } from '../../core/interceptors/http.interceptors';
import { AuthService } from '../../core/services/auth.service';
import { isRateLimited, OTP_LENGTH, OTP_RESEND_SECONDS, secondsFromMessage, useCooldown } from '../../shared/cooldown';
import { IconComponent } from '../../shared/icon.component';
import { OtpInputComponent } from '../../shared/otp-input.component';
import { passwordRules, strongPassword } from '../../shared/password';

type Step = 'email' | 'code' | 'password' | 'done';

/**
 * Mot de passe oublié en 3 étapes :
 * 1. adresse ENI → un code part vers l'e-mail de vérification du compte ;
 * 2. saisie du code → le serveur renvoie un jeton temporaire (gardé en mémoire uniquement) ;
 * 3. nouveau mot de passe.
 */
@Component({
  selector: 'app-forgot-password',
  imports: [IconComponent, OtpInputComponent, ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth.scss',
  template: `
    <div class="auth">
      <section class="hero">
        <img class="logo" src="logo.png" alt="Logo ENI" />
        <h1>{{ first() ? 'Première connexion' : 'Mot de passe oublié' }}</h1>
        <p>Indiquez votre adresse institutionnelle : un code de sécurité à {{ otpLength }} chiffres sera envoyé à l'adresse
          e-mail de vérification de votre compte. En cas de difficulté, contactez l'administrateur de la plateforme.</p>
      </section>
      <section class="panel">
        <div class="card form">
          @if (step() !== 'done') {
            <div class="stepper" aria-hidden="true">
              <span class="on"></span>
              <span [class.on]="step() !== 'email'"></span>
              <span [class.on]="step() === 'password'"></span>
            </div>
          }

          @switch (step()) {
            @case ('email') {
              <h2>{{ first() ? 'Activer mon compte' : 'Réinitialisation' }}</h2>
              <p class="muted sub">Un code à usage unique vous sera envoyé par e-mail.</p>
              @if (error()) { <div class="alert error" role="alert">{{ error() }}</div> }
              <form (submit)="$event.preventDefault(); sendCode()" novalidate>
                <div class="field">
                  <label for="email">Adresse e-mail *</label>
                  <input id="email" class="input" type="email" [formControl]="email" [placeholder]="'prenom.nom@' + domain" autocomplete="email" />
                  @if (email.invalid && (email.touched || email.dirty)) { <span class="error">Utilisez votre adresse institutionnelle &#64;{{ domain }}.</span> }
                </div>
                <button class="btn primary block lg" type="submit" [disabled]="loading()">
                  {{ loading() ? 'Envoi…' : 'Envoyer le code' }}
                </button>
              </form>
            }

            @case ('code') {
              <h2>Saisissez le code</h2>
              <p class="muted sub">
                Si un compte correspond à <strong>{{ email.value }}</strong>, un code à {{ otpLength }} chiffres vient d'être envoyé
                à son adresse e-mail de vérification. Il n'est valable que pendant une durée limitée.
              </p>
              @if (mock) { <div class="alert info">Mode démonstration : le code est <strong>123456</strong>.</div> }
              @if (error()) { <div class="alert error" role="alert">{{ error() }}</div> }
              @if (info()) { <div class="alert success" role="status">{{ info() }}</div> }
              <form (submit)="$event.preventDefault(); verifyCode()" novalidate>
                <div class="otp-field">
                  <app-otp-input #otp [(value)]="code" [disabled]="loading()" [invalid]="!!error()"
                    [autofocus]="true" (completed)="verifyCode()" />
                </div>
                <button class="btn primary block lg" type="submit" [disabled]="loading() || code().length < otpLength">
                  {{ loading() ? 'Vérification…' : 'Vérifier le code' }}
                </button>
              </form>
              <p class="resend">
                Vous n'avez rien reçu ?
                <button type="button" [disabled]="cooldown.remaining() > 0 || loading()" (click)="resend()">
                  {{ cooldown.remaining() > 0 ? 'Renvoyer le code (' + cooldown.remaining() + ' s)' : 'Renvoyer le code' }}
                </button>
              </p>
              <p class="resend"><button type="button" (click)="restart()">Utiliser une autre adresse</button></p>
            }

            @case ('password') {
              <h2>Nouveau mot de passe</h2>
              <p class="muted sub">Code vérifié. Choisissez un mot de passe que vous n'utilisez nulle part ailleurs.</p>
              @if (error()) { <div class="alert error" role="alert">{{ error() }}</div> }
              <form [formGroup]="pwdForm" (submit)="$event.preventDefault(); resetPassword()" novalidate>
                <div class="field">
                  <label for="np">Nouveau mot de passe</label>
                  <div class="pwd">
                    <input id="np" class="input" [type]="showPassword() ? 'text' : 'password'" formControlName="password"
                      placeholder="12 caractères minimum" autocomplete="new-password" />
                    <button type="button" class="icon-btn" (click)="showPassword.set(!showPassword())" [attr.aria-label]="showPassword() ? 'Masquer' : 'Afficher'">
                      <app-icon [name]="showPassword() ? 'eye-off' : 'eye'" />
                    </button>
                  </div>
                </div>
                <p class="rules">
                  <app-icon name="lock" [size]="14" /> Au moins
                  @for (r of rules(); track r.label; let last = $last) {
                    <span [class.ok]="r.ok">{{ r.label }}</span>{{ last ? '.' : ',' }}
                  }
                </p>
                <div class="field">
                  <label for="cp">Confirmer le mot de passe</label>
                  <input id="cp" class="input" [type]="showPassword() ? 'text' : 'password'" formControlName="confirm"
                    placeholder="Saisir à nouveau" autocomplete="new-password" />
                  @if (pwdForm.controls.confirm.touched && pwdForm.controls.confirm.value !== pwdForm.controls.password.value) {
                    <span class="error">Les mots de passe ne correspondent pas.</span>
                  }
                </div>
                <button class="btn primary block lg" type="submit" [disabled]="loading()">
                  {{ loading() ? 'Enregistrement…' : 'Réinitialiser le mot de passe' }}
                </button>
              </form>
              <p class="resend"><button type="button" (click)="restart()">Recommencer</button></p>
            }

            @case ('done') {
              <div class="done-box">
                <span class="done-icon"><app-icon name="circle-check" [size]="30" /></span>
                <h2>Mot de passe réinitialisé</h2>
                <p class="muted sub">Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.</p>
                <a class="btn primary block lg" routerLink="/login">Aller à la connexion</a>
              </div>
            }
          }

          @if (step() !== 'done') {
            <a class="back" routerLink="/login"><app-icon name="arrow-left" [size]="14" /> Retour à la connexion</a>
          }
        </div>
      </section>
    </div>
  `,
})
export class ForgotPasswordComponent {
  private auth = inject(AuthService);
  private fb = inject(FormBuilder);

  /** /forgot-password?first=1 : activation d'un compte créé par l'administration */
  readonly first = input<string>();

  readonly mock = environment.useMockApi;
  readonly domain = environment.mailDomain;
  readonly otpLength = OTP_LENGTH;
  readonly cooldown = useCooldown();
  readonly email = this.fb.nonNullable.control('', [
    Validators.required,
    Validators.email,
    Validators.pattern(new RegExp(`@${environment.mailDomain.replace('.', '\\.')}$`, 'i')),
  ]);
  readonly pwdForm = this.fb.nonNullable.group({
    password: ['', [Validators.required, strongPassword]],
    confirm: ['', Validators.required],
  });

  protected readonly otp = viewChild<OtpInputComponent>('otp');
  protected readonly step = signal<Step>('email');
  protected readonly code = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly info = signal('');
  protected readonly showPassword = signal(false);
  private readonly pwd = signal('');
  protected readonly rules = computed(() => passwordRules(this.pwd()));
  /** Jeton de réinitialisation : conservé en mémoire seulement (jamais dans localStorage ni dans l'URL) */
  private resetToken = '';

  constructor() {
    this.pwdForm.controls.password.valueChanges.subscribe((v) => this.pwd.set(v));
  }

  /** Étape 1 : demande du code */
  protected sendCode(): void {
    if (this.email.invalid) {
      this.email.markAsTouched();
      return;
    }
    this.request(() => this.goToCode(true));
  }

  /** Renvoi du code : même route que l'étape 1 (réponse générique, pas de fuite sur l'existence du compte) */
  protected resend(): void {
    if (this.cooldown.remaining() > 0) return;
    this.request(() => {
      this.code.set('');
      this.info.set('Si un compte correspond à cette adresse, un nouveau code vient d\u2019être envoyé.');
      this.cooldown.start(OTP_RESEND_SECONDS);
      this.focusCode();
    });
  }

  private request(onSent: () => void): void {
    this.loading.set(true);
    this.error.set('');
    this.info.set('');
    this.auth.forgotPassword(this.email.value.trim().toLowerCase()).subscribe({
      next: () => { this.loading.set(false); onSent(); },
      error: (e) => {
        this.loading.set(false);
        // 429 : un code vient déjà d'être envoyé, on passe à la saisie en attendant la fin du délai
        if (isRateLimited(e)) {
          this.cooldown.start(secondsFromMessage(errorMessage(e)));
          if (this.step() === 'email') { this.goToCode(false); return; }
        }
        this.error.set(errorMessage(e));
      },
    });
  }

  private goToCode(codeJustSent: boolean): void {
    this.code.set('');
    if (codeJustSent) this.cooldown.start(OTP_RESEND_SECONDS);
    this.step.set('code');
  }

  /** Étape 2 : vérification du code */
  protected verifyCode(): void {
    if (this.loading() || this.code().length < OTP_LENGTH) return;
    this.loading.set(true);
    this.error.set('');
    this.info.set('');
    this.auth.verifyResetOtp(this.email.value.trim().toLowerCase(), this.code()).subscribe({
      next: (r) => {
        this.loading.set(false);
        if (!r.resetToken) {
          this.error.set('Réponse inattendue du serveur : jeton de réinitialisation manquant.');
          this.code.set('');
          this.focusCode();
          return;
        }
        this.resetToken = r.resetToken;
        this.step.set('password');
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(errorMessage(e));
        this.code.set('');
        this.focusCode();
      },
    });
  }

  /** Étape 3 : nouveau mot de passe */
  protected resetPassword(): void {
    const { password, confirm } = this.pwdForm.getRawValue();
    this.error.set('');
    if (this.pwdForm.invalid) {
      this.pwdForm.markAllAsTouched();
      this.error.set('Le mot de passe ne respecte pas les règles ci-dessous.');
      return;
    }
    if (password !== confirm) {
      this.pwdForm.controls.confirm.markAsTouched();
      return;
    }
    this.loading.set(true);
    this.auth.resetPassword(this.email.value.trim().toLowerCase(), this.resetToken, password).subscribe({
      next: () => {
        this.loading.set(false);
        this.resetToken = '';
        this.step.set('done');
      },
      error: (e) => { this.loading.set(false); this.error.set(errorMessage(e)); },
    });
  }

  /** Repart de l'étape 1 (adresse erronée, jeton expiré…) */
  protected restart(): void {
    this.resetToken = '';
    this.code.set('');
    this.pwdForm.reset();
    this.error.set('');
    this.info.set('');
    this.step.set('email');
  }

  private focusCode(): void {
    // Les cases sont réactivées au prochain cycle de détection : on attend avant de reprendre le focus
    setTimeout(() => this.otp()?.focus());
  }
}
