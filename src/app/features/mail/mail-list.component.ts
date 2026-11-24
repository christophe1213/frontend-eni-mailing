import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { combineLatest, Subject, startWith, switchMap, tap } from 'rxjs';
import { BulkAction, Folder, FOLDER_LABELS, MailSummary, Page } from '../../core/models';
import { errorMessage } from '../../core/interceptors/http.interceptors';
import { MailService } from '../../core/services/mail.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { ToastService } from '../../core/services/toast.service';
import { AvatarComponent } from '../../shared/avatar.component';
import { FullNamePipe, MailDatePipe } from '../../shared/pipes';
import { IconComponent } from '../../shared/icon.component';

@Component({
  selector: 'app-mail-list',
  imports: [IconComponent, AvatarComponent, MailDatePipe, FullNamePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mail-list.component.html',
  styleUrl: './mail-list.component.scss',
})
export class MailListComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private mail = inject(MailService);
  private realtime = inject(RealtimeService);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  readonly folder = signal<Folder>('inbox');
  readonly q = signal('');
  readonly page = signal(1);
  readonly unreadOnly = signal(false);
  readonly data = signal<Page<MailSummary> | null>(null);
  readonly loading = signal(true);
  readonly selected = signal<Set<number>>(new Set());

  readonly title = computed(() => FOLDER_LABELS[this.folder()]);
  readonly items = computed(() => this.data()?.items ?? []);
  readonly allSelected = computed(() => this.items().length > 0 && this.items().every((m) => this.selected().has(m.id)));
  readonly range = computed(() => {
    const d = this.data();
    if (!d || !d.total) return '0';
    const start = (d.page - 1) * d.pageSize + 1;
    return `${start}–${Math.min(d.page * d.pageSize, d.total)} sur ${d.total}`;
  });
  readonly hasNext = computed(() => { const d = this.data(); return !!d && d.page * d.pageSize < d.total; });
  /** Dans « Envoyés » et « Brouillons », on affiche le destinataire plutôt que l'expéditeur */
  readonly showRecipient = computed(() => this.folder() === 'sent' || this.folder() === 'drafts');

  private reload$ = new Subject<void>();

  ngOnInit(): void {
    this.watchRealtime();
    combineLatest([this.route.paramMap, this.route.queryParamMap, this.reload$.pipe(startWith(undefined))])
      .pipe(
        tap(([p, qp]) => {
          this.folder.set((p.get('folder') as Folder) ?? 'inbox');
          this.q.set(qp.get('q') ?? '');
          this.page.set(Number(qp.get('page') ?? 1));
          this.loading.set(true);
        }),
        switchMap(() => this.mail.list({ folder: this.folder(), q: this.q(), page: this.page(), unread: this.unreadOnly() })),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (d) => {
          this.data.set(d);
          this.selected.set(new Set());
          this.loading.set(false);
        },
        error: (e) => { this.toast.error(errorMessage(e)); this.loading.set(false); },
      });
  }

  reload(): void { this.reload$.next(); }

  /** Nouveau message reçu : on rafraîchit la liste si l'utilisateur regarde la première page de la boîte de réception */
  private watchRealtime(): void {
    this.realtime.inboxChanged$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.folder() === 'inbox' && this.page() === 1) this.reload();
    });
  }

  toggleUnread(): void {
    this.unreadOnly.set(!this.unreadOnly());
    this.reload();
  }

  goPage(delta: number): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { page: this.page() + delta }, queryParamsHandling: 'merge' });
  }

  open(m: MailSummary): void {
    if (m.folder === 'drafts') this.router.navigate(['/compose'], { queryParams: { draft: m.id } });
    else this.router.navigate(['/mail', this.folder(), m.id]);
  }

  toggle(id: number, e: Event): void {
    e.stopPropagation();
    const s = new Set(this.selected());
    s.has(id) ? s.delete(id) : s.add(id);
    this.selected.set(s);
  }

  toggleAll(): void {
    this.selected.set(this.allSelected() ? new Set() : new Set(this.items().map((m) => m.id)));
  }

  star(m: MailSummary, e: Event): void {
    e.stopPropagation();
    this.mail.update(m.id, { starred: !m.starred }).subscribe(() => {
      if (this.folder() === 'starred') this.reload();
      else this.data.update((d) => d && { ...d, items: d.items.map((x) => (x.id === m.id ? { ...x, starred: !m.starred } : x)) });
    });
  }

  bulk(action: BulkAction): void {
    const ids = [...this.selected()];
    if (!ids.length) return;
    if (action === 'delete' && !confirm(`Supprimer définitivement ${ids.length} message(s) ?`)) return;
    this.mail.bulk(ids, action).subscribe({
      next: () => {
        const labels: Record<BulkAction, string> = {
          read: 'Marqué(s) comme lu(s)', unread: 'Marqué(s) comme non lu(s)', archive: 'Archivé(s)',
          trash: 'Déplacé(s) dans la corbeille', delete: 'Supprimé(s) définitivement', restore: 'Restauré(s)',
        };
        this.toast.success(`${ids.length} message(s) — ${labels[action]}`);
        this.reload();
      },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  emptyText(): string {
    if (this.q()) return `Aucun message ne correspond à « ${this.q()} ».`;
    const texts: Record<Folder, string> = {
      inbox: 'Votre boîte de réception est vide.', starred: 'Aucun message favori.', sent: 'Aucun message envoyé.',
      drafts: 'Aucun brouillon.', archive: 'Aucun message archivé.', trash: 'La corbeille est vide.',
    };
    return texts[this.folder()];
  }
}
