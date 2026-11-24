import { ChangeDetectionStrategy, Component, inject, input, linkedSignal, OnInit, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { errorMessage } from '../../core/interceptors/http.interceptors';
import { AuthService } from '../../core/services/auth.service';
import { isRateLimited, OTP_LENGTH, OTP_RESEND_SECONDS, secondsFromMessage, useCooldown } from '../../shared/cooldown';
import { IconComponent } from '../../shared/icon.component';
import { OtpInputComponent } from '../../shared/otp-input.component';

/**
 * Vérification de l'adresse e-mail par code OTP (étape qui suit l'inscription).
 *
 * `/verify-email?email=prenom.nom@eni.mg&sent=1`
 *  - `email` : adresse ENI du compte (le code part vers l'e-mail de vérification personnel) ;
 *  - `sent`  : un code vient d'être envoyé (inscription) → le renvoi est bloqué 60 s, comme côté serveur.
 */
@Component({
  selector: 'app-verify-email',
  imports: [IconComponent, OtpInputComponent, ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth.scss',
  template: `
    <div class="auth">
      <section class="hero">
        <img class="logo" src="logo.png" alt="Logo ENI" />
        <h1>Vérification de votre e-mail</h1>
        <p>Pour sécuriser votre compte, confirmez l'adresse personnelle indiquée lors de votre inscription.
          Elle servira aussi à récupérer votre mot de passe.</p>
      </section>

      <section class="panel">
        <div class="card form">
          @if (done()) {
            <!-- ===== Adresse vérifiée ===== -->
            <div class="done-box">
              <span class="done-icon"><app-icon name="circle-check" [size]="30" /></span>
              <h2>Adresse e-mail vérifiée</h2>
              <p class="muted sub">Votre demande est maintenant transmise à l'administration de l'ENI.</p>
              <ol class="steps">
                <li><app-icon name="circle-check" [size]="18" /> Vérification de vos informations dans le dossier administratif</li>
                <li><app-icon name="clock" [size]="18" /> Activation du compte (sous 48 h ouvrées)</li>
              </ol>
              <a class="btn primary block lg" routerLink="/login">Aller à la connexion</a>
            </div>
          } @else if (target()) {
            <!-- ===== Saisie du code ===== -->
            <h2>Saisissez votre code</h2>
            <p class="muted sub">
              Un code à {{ otpLength }} chiffres a été envoyé à l'adresse e-mail de vérification associée à
              <strong>{{ target() }}</strong>. Il n'est valable que pendant une durée limitée.
            </p>

            @if (mock) {
              <div class="alert info">Mode démonstration : le code est <strong>123456</strong>.</div>
            }
            @if (error()) { <div class="alert error" role="alert">{{ error() }}</div> }
            @if (info()) { <div class="alert success" role="status">{{ info() }}</div> }

            <form (submit)="$event.preventDefault(); verify()" novalidate>
              <div class="otp-field">
                <app-otp-input #otp [(value)]="code" [disabled]="loading()" [invalid]="!!error()"
                  [autofocus]="true" (completed)="verify()" />
              </div>
              <button class="btn primary block lg" type="submit" [disabled]="loading() || code().length < otpLength">
                {{ loading() ? 'Vérification…' : 'Vérifier' }}
              </button>
            </form>

            <p class="resend">
              Vous n'avez rien reçu ?
              <button type="button" [disabled]="cooldown.remaining() > 0 || resending()" (click)="resend()">
                {{ cooldown.remaining() > 0 ? 'Renvoyer le code (' + cooldown.remaining() + ' s)' : 'Renvoyer le code' }}
              </button>
            </p>
            <p class="resend">Pensez à vérifier vos courriers indésirables.</p>
          } @else {
            <!-- ===== Adresse du compte inconnue (accès direct à la page) ===== -->
            <h2>Vérifier mon adresse e-mail</h2>
            <p class="muted sub">Saisissez l'adresse institutionnelle de votre compte pour saisir ou recevoir un code.</p>
            <form (submit)="$event.preventDefault(); useEmail()" novalidate>
              <div class="field">
                <label for="email">Adresse e-mail institutionnelle</label>
                <input id="email" class="input" type="email" [formControl]="emailCtrl" placeholder="prenom.nom@eni.mg" autocomplete="username" />
                @if (emailCtrl.touched && emailCtrl.invalid) { <span class="error">Adresse e-mail invalide.</span> }
              </div>
              <button class="btn primary block lg" type="submit">Continuer</button>
            </form>
          }

          @if (!done()) {
            <a class="back" routerLink="/login"><app-icon name="arrow-left" [size]="14" /> Retour à la connexion</a>
          }
        </div>
      </section>
    </div>
  `,
})
export class VerifyEmailComponent implements OnInit {
  private auth = inject(AuthService);

  /** Paramètres de requête liés par `withComponentInputBinding()` */
  readonly email = input<string>();
  readonly sent = input<string>();

  readonly mock = environment.useMockApi;
  readonly otpLength = OTP_LENGTH;
  readonly cooldown = useCooldown();
  readonly emailCtrl = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] });

  protected readonly otp = viewChild<OtpInputComponent>('otp');
  protected readonly target = linkedSignal(() => this.email()?.trim().toLowerCase() ?? '');
  protected readonly code = signal('');
  protected readonly loading = signal(false);
  protected readonly resending = signal(false);
  protected readonly done = signal(false);
  protected readonly error = signal('');
  protected readonly info = signal('');

  ngOnInit(): void {
    // Arrivée juste après l'inscription : le serveur refuse un renvoi avant 60 s
    if (this.sent()) this.cooldown.start(OTP_RESEND_SECONDS);
  }

  protected useEmail(): void {
    if (this.emailCtrl.invalid) {
      this.emailCtrl.markAsTouched();
      return;
    }
    this.target.set(this.emailCtrl.value.trim().toLowerCase());
  }

  protected verify(): void {
    if (this.loading() || this.code().length < OTP_LENGTH) return;
    this.loading.set(true);
    this.error.set('');
    this.info.set('');
    this.auth.verifyOtp(this.target(), this.code(), 'REGISTER').subscribe({
      next: () => {
        this.loading.set(false);
        this.done.set(true);
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(errorMessage(e));
        this.code.set('');
        // Les cases sont réactivées au prochain cycle de détection : on attend avant de reprendre le focus
        setTimeout(() => this.otp()?.focus());
      },
    });
  }

  protected resend(): void {
    if (this.cooldown.remaining() > 0 || this.resending()) return;
    this.resending.set(true);
    this.error.set('');
    this.info.set('');
    this.auth.resendOtp(this.target(), 'REGISTER').subscribe({
      next: () => {
        this.resending.set(false);
        this.code.set('');
        this.info.set('Un nouveau code vient d\u2019être envoyé.');
        this.cooldown.start(OTP_RESEND_SECONDS);
        setTimeout(() => this.otp()?.focus());
      },
      error: (e) => {
        this.resending.set(false);
        const msg = errorMessage(e);
        if (isRateLimited(e)) this.cooldown.start(secondsFromMessage(msg));
        this.error.set(msg);
      },
    });
  }
}
