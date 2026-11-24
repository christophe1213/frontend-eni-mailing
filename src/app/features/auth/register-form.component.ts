import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { errorMessage } from '../../core/interceptors/http.interceptors';
import { Level, LEVELS, RegisterPayload, Track, TRACK_LABELS } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { IconComponent } from '../../shared/icon.component';
import { strongPassword } from '../../shared/password';
import { PhoneInputComponent } from '../../shared/phone-input.component';
import { roleBySlug, RoleMeta } from './role-meta';

const DEPARTMENTS = ['Scolarité', 'Direction des études', 'Secrétariat général', 'Comptabilité', 'Bibliothèque', 'Service informatique'];

/** Contrôles obligatoires selon le rôle (en plus des champs communs) */
const REQUIRED_BY_ROLE: Record<RoleMeta['slug'], string[]> = {
  etudiant: ['enrollmentYear', 'level', 'track'],
  enseignant: ['teacherStatus', 'specialty'],
  personnel: ['department', 'position'],
  administrateur: ['department', 'position', 'justification', 'sponsorEmail'],
};

/**
 * L'e-mail de vérification reçoit le code OTP : il doit être personnel (hors domaine ENI) et différent
 * de l'e-mail institutionnel (contrainte `ck_email_verification_distinct` du backend).
 */
function personalEmail(institutionalControl: string): ValidatorFn {
  const domain = `@${environment.mailDomain}`.toLowerCase();
  return (c: AbstractControl): ValidationErrors | null => {
    const v = String(c.value ?? '').trim().toLowerCase();
    if (!v) return null;
    if (v === String(c.parent?.get(institutionalControl)?.value ?? '').trim().toLowerCase()) return { sameAsEmail: true };
    return v.endsWith(domain) ? { institutional: true } : null;
  };
}

/** Inscription — étape 2 : formulaire adapté au rôle choisi */
@Component({
  selector: 'app-register-form',
  imports: [ReactiveFormsModule, RouterLink, IconComponent, PhoneInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './register-form.component.html',
  styleUrl: './register-form.component.scss',
})
export class RegisterFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  /** Paramètre de route `:role` (etudiant, enseignant, personnel, administrateur) */
  readonly role = input<string>();
  readonly meta = computed(() => roleBySlug(this.role()));

  readonly domain = environment.mailDomain;
  readonly levels = LEVELS;
  readonly tracks = Object.keys(TRACK_LABELS) as Track[];
  readonly trackLabels = TRACK_LABELS;
  readonly departments = DEPARTMENTS;
  readonly years = Array.from({ length: 6 }, (_, i) => `${2026 - i}-${2027 - i}`);

  readonly sending = signal(false);
  readonly error = signal('');
  readonly showPassword = signal(false);

  readonly form = this.fb.nonNullable.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email, Validators.pattern(new RegExp(`@${environment.mailDomain.replace('.', '\\.')}$`, 'i'))]],
    // Pays/format/opérateur/longueur validés par <app-phone-input> ; valeur = numéro international (ex. +261341234567, +33612345678)
    phone: ['', Validators.required],
    // Adresse personnelle qui reçoit le code OTP de vérification
    emailVerification: ['', [Validators.required, Validators.email, personalEmail('email')]],
    matricule: ['', Validators.required],
    // Étudiant
    enrollmentYear: [''],
    level: ['' as Level | ''],
    track: ['' as Track | ''],
    // Enseignant
    teacherStatus: ['PERMANENT' as 'PERMANENT' | 'VACATAIRE'],
    specialty: [''],
    levelsTaught: [[] as Level[]],
    // Personnel / administrateur
    department: [''],
    position: [''],
    justification: [''],
    sponsorEmail: ['', Validators.email],
    // Sécurité
    password: ['', [Validators.required, strongPassword]],
    confirm: ['', Validators.required],
    accept: [false, Validators.requiredTrue],
  });

  /** Indicateurs affichés sous le mot de passe */
  readonly pwd = signal('');
  readonly rules = computed(() => {
    const v = this.pwd();
    return [
      { ok: v.length >= 12, label: '12 caractères' },
      { ok: /[A-Z]/.test(v), label: 'une majuscule' },
      { ok: /\d/.test(v), label: 'un chiffre' },
      { ok: /[^A-Za-z0-9]/.test(v), label: 'un symbole' },
    ];
  });

  readonly idLabel = computed(() => ({
    etudiant: 'Matricule étudiant', enseignant: 'Identifiant enseignant', personnel: 'Identifiant agent', administrateur: 'Identifiant agent',
  })[this.meta()?.slug ?? 'etudiant']);
  readonly idPlaceholder = computed(() => ({
    etudiant: 'Ex. ENI-2026-0123', enseignant: 'Ex. ENS-0042', personnel: 'Ex. PER-0015', administrateur: 'Ex. ADM-0002',
  })[this.meta()?.slug ?? 'etudiant']);

  ngOnInit(): void {
    const meta = this.meta();
    if (!meta) {
      this.router.navigate(['/register']);
      return;
    }
    for (const name of REQUIRED_BY_ROLE[meta.slug]) {
      this.form.get(name)!.addValidators(Validators.required);
    }
    if (meta.slug === 'enseignant') {
      this.form.controls.levelsTaught.addValidators((c) => (c.value?.length ? null : { required: true }));
    }
    this.form.controls.password.valueChanges.subscribe((v) => this.pwd.set(v));
    // « différent de l'e-mail ENI » dépend d'un autre champ : on revalide quand celui-ci change
    this.form.controls.email.valueChanges.subscribe(() => this.form.controls.emailVerification.updateValueAndValidity());
  }

  invalid(name: string): boolean {
    const c = this.form.get(name)!;
    return c.invalid && (c.touched || c.dirty);
  }

  toggleLevel(l: Level): void {
    const c = this.form.controls.levelsTaught;
    c.setValue(c.value.includes(l) ? c.value.filter((x) => x !== l) : [...c.value, l].sort());
    c.markAsTouched();
  }

  submit(): void {
    this.error.set('');
    const v = this.form.getRawValue();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Veuillez corriger les champs signalés.');
      return;
    }
    if (v.password !== v.confirm) {
      this.error.set('Les deux mots de passe ne correspondent pas.');
      return;
    }
    const meta = this.meta()!;
    const payload: RegisterPayload = {
      role: meta.role, firstName: v.firstName, lastName: v.lastName, email: v.email,
      emailVerification: v.emailVerification.trim().toLowerCase(), phone: v.phone,
      matricule: v.matricule, password: v.password,
      level: v.level || null, track: v.track || null, enrollmentYear: v.enrollmentYear || null,
      teacherStatus: meta.slug === 'enseignant' ? v.teacherStatus : null, specialty: v.specialty || null,
      levelsTaught: v.levelsTaught, department: v.department || null, position: v.position || null,
      justification: v.justification || null, sponsorEmail: v.sponsorEmail || null,
    };
    this.sending.set(true);
    this.auth.register(payload).subscribe({
      // Le code OTP vient de partir vers l'e-mail de vérification : on passe à sa saisie
      next: (r) => {
        this.sending.set(false);
        this.router.navigate(['/verify-email'], { queryParams: { email: r.email, sent: 1 } });
      },
      error: (e) => { this.sending.set(false); this.error.set(errorMessage(e)); },
    });
  }
}
