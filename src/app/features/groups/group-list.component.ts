import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MailGroup, ROLE_LABELS } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { GroupService } from '../../core/services/group.service';
import { IconComponent } from '../../shared/icon.component';

@Component({
  selector: 'app-group-list',
  imports: [IconComponent, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>Listes de diffusion</h1>
          <p>Écrivez à toute une promotion, un parcours ou un groupe en une seule fois.</p>
        </div>
        @if (auth.hasRole('ENSEIGNANT')) {
          <a class="btn primary" routerLink="/groups/new"><app-icon name="plus" [size]="16" /> Nouvelle liste</a>
        }
      </div>

      <div class="toolbar">
        <input class="input grow" type="search" placeholder="Rechercher une liste…" [ngModel]="q()" (ngModelChange)="q.set($event)" />
        <select class="input" [ngModel]="type()" (ngModelChange)="type.set($event)" aria-label="Type">
          <option value="">Tous les types</option>
          <option value="AUTO">Automatiques</option>
          <option value="MANUELLE">Manuelles</option>
        </select>
      </div>

      @if (loading()) {
        <div class="spinner"></div>
      } @else {
        <div class="grid">
          @for (g of filtered(); track g.id) {
            <article class="card group">
              <div class="top">
                <span class="ic"><app-icon [name]="g.type === 'AUTO' ? 'settings' : 'group'" [size]="20" /></span>
                <div class="t">
                  <a [routerLink]="['/groups', g.id]"><h3>{{ g.name }}</h3></a>
                  <span class="muted addr">{{ g.address }}</span>
                </div>
              </div>
              <p>{{ g.description }}</p>
              <div class="tags">
                <span class="badge" [class.primary]="g.type === 'AUTO'">{{ g.type === 'AUTO' ? 'Automatique' : 'Manuelle' }}</span>
                <span class="badge">{{ g.memberCount }} membre(s)</span>
                @if (g.type === 'AUTO') { <span class="badge">{{ criteria(g) }}</span> }
                @if (g.openToStudents) { <span class="badge green">Ouverte aux étudiants</span> }
              </div>
              <div class="act">
                <a class="btn sm" [routerLink]="['/groups', g.id]">Détails</a>
                @if (canWrite(g)) {
                  <a class="btn sm primary" routerLink="/compose" [queryParams]="{ group: g.id }"><app-icon name="mail" [size]="14" /> Écrire</a>
                }
              </div>
            </article>
          } @empty {
            <div class="empty"><div class="empty-icon"><app-icon name="megaphone" [size]="28" /></div><p>Aucune liste trouvée.</p></div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }
    .group { padding: 18px; display: flex; flex-direction: column; gap: 10px;
      .top { display: flex; gap: 12px; align-items: center; }
      .ic { width: 42px; height: 42px; display: grid; place-items: center; background: var(--primary-50); border-radius: 10px; font-size: 20px; }
      .t a { color: var(--text); } .addr { font-size: 12px; }
      p { margin: 0; color: var(--text-2); flex: 1; }
      .tags { display: flex; flex-wrap: wrap; gap: 6px; }
      .act { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }
    }
  `,
})
export class GroupListComponent implements OnInit {
  readonly auth = inject(AuthService);
  private groups = inject(GroupService);

  readonly q = signal('');
  readonly type = signal('');
  readonly all = signal<MailGroup[]>([]);
  readonly loading = signal(true);
  /** Filtrage local (le volume de listes reste faible) */
  readonly filtered = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.all().filter((g) => (!this.type() || g.type === this.type())
      && (!q || `  `.toLowerCase().includes(q)));
  });

  ngOnInit(): void {
    this.groups.list().subscribe((g) => {
      this.all.set(g);
      this.loading.set(false);
    });
  }

  criteria(g: MailGroup): string {
    return [g.criteriaRole && ROLE_LABELS[g.criteriaRole], g.criteriaLevel, g.criteriaTrack].filter(Boolean).join(' · ') || 'Tous';
  }

  canWrite(g: MailGroup): boolean {
    return this.auth.user()?.role !== 'ETUDIANT' || g.openToStudents;
  }
}
