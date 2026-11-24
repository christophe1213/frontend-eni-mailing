import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, debounceTime, of, Subject, switchMap } from 'rxjs';
import { LEVELS, ROLE_LABELS, Role, Track, TRACK_LABELS, User } from '../../core/models';
import { errorMessage } from '../../core/interceptors/http.interceptors';
import { AuthService } from '../../core/services/auth.service';
import { ContactService } from '../../core/services/contact.service';
import { ToastService } from '../../core/services/toast.service';
import { UserService } from '../../core/services/user.service';
import { AvatarComponent } from '../../shared/avatar.component';
import { FullNamePipe, PhonePipe, RoleLabelPipe } from '../../shared/pipes';
import { IconComponent } from '../../shared/icon.component';

@Component({
  selector: 'app-directory',
  imports: [IconComponent, FormsModule, RouterLink, AvatarComponent, FullNamePipe, RoleLabelPipe, PhonePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>Annuaire</h1>
          <p>Retrouvez les étudiants, enseignants et personnels de l'ENI.</p>
        </div>
        <span class="muted">{{ onlyMine() ? shown().length : total() }} personne(s)</span>
      </div>

      <div class="toolbar">
        <input class="input grow" type="search" placeholder="Nom, e-mail, matricule, fonction…" [(ngModel)]="q" (ngModelChange)="search()" />
        <select class="input" [(ngModel)]="role" (ngModelChange)="search()" aria-label="Rôle">
          <option value="">Tous les rôles</option>
          @for (r of roles; track r) { <option [value]="r">{{ roleLabels[r] }}</option> }
        </select>
        <select class="input" [(ngModel)]="level" (ngModelChange)="search()" aria-label="Niveau">
          <option value="">Tous niveaux</option>
          @for (l of levels; track l) { <option [value]="l">{{ l }}</option> }
        </select>
        <select class="input" [(ngModel)]="track" (ngModelChange)="search()" aria-label="Parcours">
          <option value="">Tous parcours</option>
          @for (t of tracks; track t) { <option [value]="t">{{ t }} – {{ trackLabels[t] }}</option> }
        </select>
        <div class="scope" role="group" aria-label="Affichage">
          <button type="button" class="btn" [class.primary]="!onlyMine()" (click)="onlyMine.set(false)">Tous</button>
          <button type="button" class="btn" [class.primary]="onlyMine()" (click)="onlyMine.set(true)"><app-icon name="book" [size]="15" /> Mes contacts ({{ mine().size }})</button>
        </div>
      </div>

      @if (loading()) {
        <div class="spinner"></div>
      } @else if (!shown().length) {
        <div class="empty">
          <div class="empty-icon"><app-icon [name]="onlyMine() && !q ? 'book' : 'search-x'" [size]="28" /></div>
          @if (onlyMine() && !q) {
            <p>Votre annuaire personnel est vide. Ouvrez la fiche d'une personne et choisissez « Ajouter à mes contacts ».</p>
          } @else {
            <p>Aucun résultat.</p>
          }
        </div>
      } @else {
        <div class="grid">
          @for (p of shown(); track p.id) {
            <button class="card person" (click)="selected.set(p)">
              <app-avatar [user]="p" [size]="48" />
              <div class="info">
                <strong>{{ p | fullName }}</strong>
                <span class="muted">{{ p.position || (p.level ? p.level + ' · ' + p.track : '') }}</span>
                <span class="email">{{ p.email }}</span>
              </div>
              @if (isMine(p)) { <app-icon class="in-book" name="book" [size]="16" /> }
              <span class="badge" [class.primary]="p.role !== 'ETUDIANT'">{{ p.role | roleLabel }}</span>
            </button>
          }
        </div>
      }
    </div>

    @if (selected(); as p) {
      <div class="modal-backdrop" (click)="selected.set(null)">
        <div class="modal" (click)="$event.stopPropagation()">
          <header>
            <h2>Fiche contact</h2>
            <button class="icon-btn" (click)="selected.set(null)" aria-label="Fermer"><app-icon name="x" /></button>
          </header>
          <div class="modal-body contact">
            <app-avatar [user]="p" [size]="72" />
            <h2>{{ p | fullName }}</h2>
            <span class="badge primary">{{ p.role | roleLabel }}</span>
            <dl>
              <dt>E-mail</dt><dd>{{ p.email }}</dd>
              <dt>Matricule</dt><dd>{{ p.matricule }}</dd>
              @if (p.position) { <dt>Fonction</dt><dd>{{ p.position }}</dd> }
              @if (p.level) { <dt>Niveau</dt><dd>{{ p.level }}</dd> }
              @if (p.track) { <dt>Parcours</dt><dd>{{ trackLabels[p.track] }}</dd> }
              @if (p.phone) { <dt>Téléphone</dt><dd>{{ p.phone | phone }}</dd> }
            </dl>
          </div>
          <footer>
            <button class="btn" (click)="selected.set(null)">Fermer</button>
            @if (p.id !== auth.user()?.id) {
              @if (isMine(p)) {
                <button class="btn" (click)="removeContact(p)" [disabled]="busy()"><app-icon name="x" [size]="16" /> Retirer de mes contacts</button>
              } @else {
                <button class="btn" (click)="addContact(p)" [disabled]="busy()"><app-icon name="user-plus" [size]="16" /> Ajouter à mes contacts</button>
              }
            }
            <a class="btn primary" routerLink="/compose" [queryParams]="{ to: p.id }"><app-icon name="mail" [size]="16" /> Écrire un message</a>
          </footer>
        </div>
      </div>
    }
  `,
  styles: `
    .scope { display: flex; gap: 6px; }
    .in-book { color: var(--primary); }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
    .person { display: flex; align-items: center; gap: 12px; padding: 14px; text-align: left; cursor: pointer; font: inherit; color: var(--text); box-shadow: none;
      &:hover { border-color: var(--primary); }
      .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; span { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } }
      .email { color: var(--primary); }
    }
    .contact { display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center;
      dl { display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; margin: 16px 0 0; text-align: left; width: 100%; }
      dt { color: var(--text-2); } dd { margin: 0; font-weight: 500; }
    }
  `,
})
export class DirectoryComponent implements OnInit {
  private users = inject(UserService);
  private contactsApi = inject(ContactService);
  private toast = inject(ToastService);
  readonly auth = inject(AuthService);

  readonly roles = Object.keys(ROLE_LABELS) as Role[];
  readonly roleLabels = ROLE_LABELS;
  readonly levels = LEVELS;
  readonly tracks = Object.keys(TRACK_LABELS) as Track[];
  readonly trackLabels = TRACK_LABELS;

  q = '';
  role = '';
  level = '';
  track = '';
  readonly people = signal<User[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly selected = signal<User | null>(null);

  // Annuaire personnel : identifiants des utilisateurs ajoutés au carnet
  readonly mine = signal<Set<number>>(new Set());
  readonly onlyMine = signal(false);
  readonly busy = signal(false);
  readonly shown = computed(() => (this.onlyMine() ? this.people().filter((p) => this.isMine(p)) : this.people()));

  private search$ = new Subject<void>();

  ngOnInit(): void {
    this.search$
      .pipe(debounceTime(250), switchMap(() => this.users.list({ q: this.q, role: this.role, level: this.level, track: this.track, active: true, pageSize: 200 })))
      .subscribe((p) => {
        this.people.set(p.items);
        this.total.set(p.total);
        this.loading.set(false);
      });
    this.search();
    this.loadContacts();
  }

  isMine(u: Pick<User, 'id'>): boolean {
    return this.mine().has(u.id);
  }

  private loadContacts(): void {
    const me = this.auth.user()?.id;
    if (!me) return;
    this.contactsApi.all(me).pipe(catchError(() => of([] as User[]))).subscribe((list) =>
      this.mine.set(new Set(list.map((c) => c.id))));
  }

  addContact(u: User): void {
    const me = this.auth.user()?.id;
    if (!me) return;
    this.busy.set(true);
    this.contactsApi.add(me, u.id).subscribe({
      next: () => {
        this.mine.update((s) => new Set(s).add(u.id));
        this.busy.set(false);
        this.toast.success(`${u.firstName} ${u.lastName} ajouté à vos contacts`);
      },
      error: (e) => {
        this.busy.set(false);
        if (e?.status === 409) { this.mine.update((s) => new Set(s).add(u.id)); this.toast.show('Déjà dans vos contacts'); } // anti-doublon
        else this.toast.error(errorMessage(e));
      },
    });
  }

  removeContact(u: User): void {
    const me = this.auth.user()?.id;
    if (!me || !this.isMine(u)) return;
    this.busy.set(true);
    this.contactsApi.remove(me, u.id).subscribe({
      next: () => {
        this.mine.update((s) => { const n = new Set(s); n.delete(u.id); return n; });
        this.busy.set(false);
        this.toast.success('Contact retiré de votre annuaire');
      },
      error: (e) => { this.busy.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  search(): void {
    this.search$.next();
  }
}
