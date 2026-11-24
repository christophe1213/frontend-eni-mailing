import { ChangeDetectionStrategy, Component, HostListener, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, finalize, Subject, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LEVELS, Page, Role, ROLE_LABELS, Track, TRACK_LABELS, User, UserPayload } from '../../core/models';
import { errorMessage } from '../../core/interceptors/http.interceptors';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { UserService } from '../../core/services/user.service';
import { AvatarComponent } from '../../shared/avatar.component';
import { FullNamePipe, MailDatePipe, RoleLabelPipe } from '../../shared/pipes';
import { IconComponent } from '../../shared/icon.component';
import { PhoneInputComponent } from '../../shared/phone-input.component';

/** Action possible sur une inscription en attente */
type PendingAction = 'validate' | 'reject';

@Component({
  selector: 'app-admin-users',
  imports: [IconComponent, FormsModule, ReactiveFormsModule, AvatarComponent, FullNamePipe, RoleLabelPipe, MailDatePipe, PhoneInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-users.component.html',
  styles: `
    .who { display: flex; align-items: center; gap: 10px; div { display: flex; flex-direction: column; } span { font-size: 12px; } }
    .right { text-align: right; white-space: nowrap; }
    .off { opacity: .55; }
    .pending-actions { display: inline-flex; align-items: center; gap: 6px; margin-left: 4px; }
    .confirm { max-width: 440px; }
    .confirm-user { margin-bottom: 14px; }
    .confirm-text { margin: 0; color: var(--text-2); line-height: 1.5; }
    /* Retour visuel : la ligne validée se met brièvement en surbrillance */
    tr.validated { animation: row-validated 1.8s ease-out; }
    .badge.pop { animation: badge-pop .35s ease-out; }
    @keyframes row-validated { 0%, 40% { background: var(--primary-100); } 100% { background: transparent; } }
    @keyframes badge-pop { 0% { transform: scale(.7); opacity: .4; } 60% { transform: scale(1.12); } 100% { transform: scale(1); opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { tr.validated, .badge.pop { animation: none; } }
    .pager { display: flex; justify-content: flex-end; align-items: center; gap: 8px; padding: 12px 14px; border-top: 1px solid var(--border); }
  `,
})
export class AdminUsersComponent implements OnInit {
  private users = inject(UserService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);
  readonly auth = inject(AuthService);

  readonly roles = Object.keys(ROLE_LABELS) as Role[];
  readonly roleLabels = ROLE_LABELS;
  readonly levels = LEVELS;
  readonly tracks = Object.keys(TRACK_LABELS) as Track[];
  readonly domain = environment.mailDomain;

  q = '';
  role = '';
  active: '' | 'true' | 'false' | 'pending' = '';
  page = 1;
  readonly data = signal<Page<User> | null>(null);
  private search$ = new Subject<void>();

  /** undefined = fermé, null = création, User = édition */
  readonly editing = signal<User | null | undefined>(undefined);
  readonly error = signal('');
  readonly saving = signal(false);

  /** Confirmation en attente (validation ou refus d'une inscription) */
  readonly confirming = signal<{ user: User; kind: PendingAction } | null>(null);
  /** Appels API en cours, par identifiant d'utilisateur (évite les doubles clics) */
  readonly busy = signal<Record<number, PendingAction>>({});
  /** Utilisateur dont l'inscription vient d'être validée (surbrillance temporaire) */
  readonly flash = signal<number | null>(null);

  readonly form = this.fb.nonNullable.group({
    matricule: ['', Validators.required],
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    role: ['ETUDIANT' as Role, Validators.required],
    level: [null as string | null],
    track: [null as string | null],
    position: [''],
    phone: [''],
    active: [true],
  });

  ngOnInit(): void {
    this.search$
      .pipe(
        debounceTime(200),
        switchMap(() => this.users.list({
          q: this.q, role: this.role, active: this.active === '' || this.active === 'pending' ? this.active : this.active === 'true', page: this.page, pageSize: 15,
        })),
      )
      .subscribe((d) => this.data.set(d));
    this.search();
  }

  search(resetPage = true): void {
    if (resetPage) this.page = 1;
    this.search$.next();
  }

  goPage(delta: number): void {
    this.page += delta;
    this.search(false);
  }

  pages(d: Page<User>): number {
    return Math.max(1, Math.ceil(d.total / d.pageSize));
  }

  open(u: User | null): void {
    this.error.set('');
    this.form.reset({
      matricule: u?.matricule ?? '', firstName: u?.firstName ?? '', lastName: u?.lastName ?? '', email: u?.email ?? '',
      role: u?.role ?? 'ETUDIANT', level: u?.level ?? null, track: u?.track ?? null, position: u?.position ?? '',
      phone: u?.phone ?? '', active: u?.active ?? true,
    });
    this.editing.set(u);
  }

  /** RG01 : adresse prenom.nom@domaine proposée automatiquement à la création */
  suggestEmail(): void {
    const { firstName, lastName, email } = this.form.getRawValue();
    if (this.editing() || email || !firstName || !lastName) return;
    const clean = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, '');
    this.form.controls.email.setValue(`${clean(firstName)}.${clean(lastName)}@${this.domain}`);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Veuillez compléter les champs obligatoires.');
      return;
    }
    const v = this.form.getRawValue();
    const payload: UserPayload = { ...v, level: (v.level || null) as UserPayload['level'], track: (v.track || null) as UserPayload['track'] };
    const u = this.editing();
    this.saving.set(true);
    (u ? this.users.update(u.id, payload) : this.users.create(payload)).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(u ? 'Utilisateur mis à jour' : 'Utilisateur créé');
        this.editing.set(undefined);
        this.search(false);
      },
      error: (e) => { this.saving.set(false); this.error.set(errorMessage(e)); },
    });
  }

  toggleActive(u: User): void {
    const verb = u.active ? 'Désactiver' : 'Réactiver';
    if (!confirm(`${verb} le compte de ${u.firstName} ${u.lastName} ?`)) return;
    this.users.setActive(u.id, !u.active).subscribe({
      next: () => { this.toast.success(`Compte ${u.active ? 'désactivé' : 'réactivé'}`); this.search(false); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  // --- Inscriptions en attente : valider / refuser ---

  /** Ouvre la boîte de confirmation (aucun appel API tant que l'admin n'a pas confirmé) */
  ask(u: User, kind: PendingAction): void {
    if (this.busy()[u.id]) return;
    this.confirming.set({ user: u, kind });
  }

  cancelConfirm(): void {
    this.confirming.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.confirming()) this.cancelConfirm();
  }

  submitConfirm(): void {
    const c = this.confirming();
    if (!c) return;
    this.confirming.set(null);
    this.runPending(c.user, c.kind);
  }

  private runPending(u: User, kind: PendingAction): void {
    if (this.busy()[u.id]) return;
    this.setBusy(u.id, kind);
    // Aucun endpoint dédié au refus : le compte est conservé mais reste inactif (pending → false, active → false).
    this.users.setActive(u.id, kind === 'validate').pipe(finalize(() => this.setBusy(u.id, null))).subscribe({
      next: (res) => {
        this.patchRow({ ...u, ...res, pending: false });
        if (kind === 'validate') {
          this.toast.success(`Inscription validée : le compte de ${u.firstName} ${u.lastName} est actif`);
          this.flash.set(u.id);
          // Laisse l'animation se jouer, puis resynchronise la liste (utile avec le filtre « En attente »)
          setTimeout(() => { this.flash.set(null); this.search(false); }, 1800);
        } else {
          this.toast.success(`Inscription refusée : ${u.firstName} ${u.lastName}`);
          this.search(false);
        }
      },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  private setBusy(id: number, kind: PendingAction | null): void {
    this.busy.update((b) => {
      const next = { ...b };
      if (kind) next[id] = kind; else delete next[id];
      return next;
    });
  }

  /** Met à jour la ligne localement pour un retour immédiat, sans attendre le rechargement */
  private patchRow(user: User): void {
    this.data.update((d) => d && { ...d, items: d.items.map((x) => (x.id === user.id ? user : x)) });
  }
}
