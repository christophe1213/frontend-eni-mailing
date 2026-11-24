import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { debounceTime, Subject, switchMap } from 'rxjs';
import { AuditLog, Page } from '../../core/models';
import { AdminService } from '../../core/services/admin.service';
import { FullNamePipe, MailDatePipe } from '../../shared/pipes';
import { IconComponent } from '../../shared/icon.component';

const ACTIONS: Record<string, { label: string; color: string }> = {
  LOGIN: { label: 'Connexion', color: '' },
  LOGIN_FAILED: { label: 'Échec connexion', color: 'red' },
  REGISTER: { label: 'Inscription', color: 'amber' },
  SEND: { label: 'Envoi', color: '' },
  BROADCAST: { label: 'Diffusion', color: 'primary' },
  ANNOUNCEMENT: { label: 'Annonce', color: 'primary' },
  USER_CREATE: { label: 'Création compte', color: 'green' },
  USER_UPDATE: { label: 'Modification compte', color: '' },
  USER_DISABLE: { label: 'Désactivation', color: 'red' },
  USER_ENABLE: { label: 'Réactivation', color: 'green' },
  USER_RESET_PASSWORD: { label: 'Réinit. mot de passe', color: 'amber' },
  GROUP_CREATE: { label: 'Création liste', color: 'green' },
  GROUP_UPDATE: { label: 'Modification liste', color: '' },
  GROUP_DELETE: { label: 'Suppression liste', color: 'red' },
  TEMPLATE_CREATE: { label: 'Création modèle', color: 'green' },
  TEMPLATE_UPDATE: { label: 'Modification modèle', color: '' },
  TEMPLATE_DELETE: { label: 'Suppression modèle', color: 'red' },
};

/** Noms d'actions utilisés par l'API FastAPI → libellés ci-dessus */
const ALIASES: Record<string, string> = {
  USER_ACTIVATE: 'USER_ENABLE',
  USER_DEACTIVATE: 'USER_DISABLE',
  PASSWORD_RESET: 'USER_RESET_PASSWORD',
};

/** Le backend enregistre parfois les détails en JSON : on les rend lisibles */
function readableDetails(details: string): string {
  if (!details.startsWith('{')) return details;
  try {
    return Object.entries(JSON.parse(details) as Record<string, unknown>).map(([k, v]) => `${k} : ${v}`).join(' · ');
  } catch {
    return details;
  }
}

@Component({
  selector: 'app-admin-logs',
  imports: [IconComponent, FormsModule, FullNamePipe, MailDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-header">
        <div><h1>Journal d'audit</h1><p>Traçabilité des connexions, diffusions et opérations d'administration (RG10).</p></div>
      </div>
      <div class="toolbar">
        <input class="input grow" type="search" placeholder="Rechercher (détail, e-mail)…" [(ngModel)]="q" (ngModelChange)="search()" />
        <select class="input" [(ngModel)]="action" (ngModelChange)="search()" aria-label="Action">
          <option value="">Toutes les actions</option>
          @for (a of actionKeys; track a) { <option [value]="a">{{ actions[a].label }}</option> }
        </select>
      </div>
      <div class="card">
        @if (data(); as d) {
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Détail</th><th>IP</th></tr></thead>
              <tbody>
                @for (l of d.items; track l.id) {
                  <tr>
                    <td class="nowrap" [title]="l.date">{{ l.date | mailDate: true }}</td>
                    <td>{{ l.user ? (l.user | fullName) : '—' }}</td>
                    <td><span class="badge" [class]="actions[l.action]?.color">{{ actions[l.action]?.label ?? l.action }}</span></td>
                    <td>{{ l.details }}</td>
                    <td class="muted">{{ l.ip }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="5" class="muted">Aucune entrée.</td></tr>
                }
              </tbody>
            </table>
          </div>
          <div class="pager">
            <span class="muted">{{ d.total }} entrée(s)</span>
            <button class="btn sm" [disabled]="page <= 1" (click)="go(-1)" aria-label="Page précédente"><app-icon name="chevron-left" [size]="16" /></button>
            <button class="btn sm" [disabled]="page * d.pageSize >= d.total" (click)="go(1)" aria-label="Page suivante"><app-icon name="chevron-right" [size]="16" /></button>
          </div>
        } @else {
          <div class="spinner"></div>
        }
      </div>
    </div>
  `,
  styles: `
    .nowrap { white-space: nowrap; }
    .pager { display: flex; justify-content: flex-end; align-items: center; gap: 8px; padding: 12px 14px; border-top: 1px solid var(--border); }
  `,
})
export class AdminLogsComponent implements OnInit {
  private admin = inject(AdminService);
  readonly actions = ACTIONS;
  readonly actionKeys = Object.keys(ACTIONS);

  q = '';
  action = '';
  page = 1;
  readonly data = signal<Page<AuditLog> | null>(null);
  private search$ = new Subject<void>();

  ngOnInit(): void {
    this.search$
      .pipe(debounceTime(200), switchMap(() => this.admin.logs({ q: this.q, action: this.action, page: this.page })))
      .subscribe((d) => this.data.set({
        ...d,
        items: d.items.map((l) => ({ ...l, action: ALIASES[l.action] ?? l.action, details: readableDetails(l.details ?? '') })),
      }));
    this.search();
  }

  search(): void {
    this.page = 1;
    this.search$.next();
  }

  go(delta: number): void {
    this.page += delta;
    this.search$.next();
  }
}
