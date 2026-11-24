import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminStats, Role, ROLE_LABELS } from '../../core/models';
import { AdminService } from '../../core/services/admin.service';
import { AvatarComponent } from '../../shared/avatar.component';
import { FullNamePipe } from '../../shared/pipes';
import { IconComponent } from '../../shared/icon.component';

@Component({
  selector: 'app-admin-dashboard',
  imports: [IconComponent, RouterLink, AvatarComponent, FullNamePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-header">
        <div><h1>Tableau de bord</h1><p>Vue d'ensemble de l'activité de la messagerie.</p></div>
        <div class="hdr"><a class="btn" routerLink="/admin/logs"><app-icon name="logs" [size]="16" /> Journal</a><a class="btn primary" routerLink="/admin/users"><app-icon name="user-cog" [size]="16" /> Gérer les utilisateurs</a></div>
      </div>

      @if (stats(); as s) {
        <div class="kpis">
          <div class="card kpi"><span class="lbl">Utilisateurs actifs</span><strong>{{ s.users.active }}</strong><span class="muted">sur {{ s.users.total }} comptes</span></div>
          <div class="card kpi"><span class="lbl">Messages envoyés</span><strong>{{ s.messagesSent }}</strong><span class="muted">dont {{ s.messagesToday }} aujourd'hui</span></div>
          <div class="card kpi"><span class="lbl">Annonces officielles</span><strong>{{ s.announcements }}</strong><span class="muted">diffusions</span></div>
          <div class="card kpi"><span class="lbl">Listes de diffusion</span><strong>{{ s.groups }}</strong><span class="muted">auto + manuelles</span></div>
        </div>

        <div class="cols">
          <section class="card card-body">
            <h2>Messages envoyés — 14 derniers jours</h2>
            <div class="chart" role="img" [attr.aria-label]="'Activité : ' + s.messagesSent + ' messages'">
              @for (d of s.activity; track d.date) {
                <div class="bar-col" [title]="d.count + ' message(s) le ' + d.date">
                  <span class="val">{{ d.count || '' }}</span>
                  <div class="bar" [style.height.%]="(d.count / maxActivity()) * 100"></div>
                  <span class="day">{{ d.date.slice(8, 10) }}</span>
                </div>
              }
            </div>
          </section>

          <section class="card card-body">
            <h2>Répartition des comptes</h2>
            <ul class="roles">
              @for (r of roles; track r) {
                <li>
                  <span>{{ roleLabels[r] }}</span>
                  <div class="track"><div class="fill" [style.width.%]="(s.users.byRole[r] / s.users.total) * 100"></div></div>
                  <strong>{{ s.users.byRole[r] }}</strong>
                </li>
              }
            </ul>

            <h2 class="mt">Principaux expéditeurs</h2>
            <ul class="senders">
              @for (t of s.topSenders; track t.user.id) {
                <li><app-avatar [user]="t.user" [size]="28" /><span>{{ t.user | fullName }}</span><strong>{{ t.count }}</strong></li>
              }
            </ul>
          </section>
        </div>
      } @else {
        <div class="spinner"></div>
      }
    </div>
  `,
  styles: `
    .hdr { display: flex; gap: 8px; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 16px; }
    .kpi { padding: 18px; display: flex; flex-direction: column; gap: 4px;
      .lbl { font-size: 13px; color: var(--text-2); } strong { font-size: 30px; font-weight: 700; } .muted { font-size: 12px; } }
    .cols { display: grid; grid-template-columns: 1.6fr 1fr; gap: 16px; @media (max-width: 960px) { grid-template-columns: 1fr; } }
    h2 { margin-bottom: 16px; } .mt { margin-top: 24px; }
    .chart { display: flex; align-items: flex-end; gap: 6px; height: 220px; padding-top: 10px; }
    .bar-col { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 4px; }
    .bar { width: 100%; max-width: 30px; min-height: 2px; background: var(--primary); border-radius: 4px 4px 0 0; transition: height .3s; }
    .bar-col:hover .bar { background: var(--primary-600); }
    .val { font-size: 11px; color: var(--text-2); }
    .day { font-size: 11px; color: var(--muted); }
    .roles, .senders { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
    .roles li { display: grid; grid-template-columns: 110px 1fr 30px; align-items: center; gap: 10px; strong { text-align: right; } }
    .track { height: 8px; background: var(--surface-2); border-radius: 4px; overflow: hidden; }
    .fill { height: 100%; background: var(--primary); border-radius: 4px; }
    .senders li { display: flex; align-items: center; gap: 10px; span { flex: 1; } }
  `,
})
export class AdminDashboardComponent implements OnInit {
  private admin = inject(AdminService);
  readonly stats = signal<AdminStats | null>(null);
  readonly roles: Role[] = ['ETUDIANT', 'ENSEIGNANT', 'PERSONNEL', 'ADMIN'];
  readonly roleLabels = ROLE_LABELS;
  readonly maxActivity = computed(() => Math.max(1, ...(this.stats()?.activity.map((a) => a.count) ?? [1])));

  ngOnInit(): void {
    this.admin.stats().subscribe((s) => this.stats.set(s));
  }
}
