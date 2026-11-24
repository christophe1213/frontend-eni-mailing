import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { Folder, FOLDER_LABELS } from '../core/models';
import { AuthService } from '../core/services/auth.service';
import { MailService } from '../core/services/mail.service';
import { RealtimeService } from '../core/services/realtime.service';
import { AvatarComponent } from '../shared/avatar.component';
import { IconComponent, IconName } from '../shared/icon.component';
import { RoleLabelPipe } from '../shared/pipes';

interface NavItem {
  folder: Folder;
  icon: IconName;
}

@Component({
  selector: 'app-shell',
  imports: [IconComponent, RouterOutlet, RouterLink, RouterLinkActive, AvatarComponent, RoleLabelPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  readonly mail = inject(MailService);
  private realtime = inject(RealtimeService);
  private router = inject(Router);

  readonly labels = FOLDER_LABELS;
  readonly folders: NavItem[] = [
    { folder: 'inbox', icon: 'inbox' },
    { folder: 'starred', icon: 'star' },
    { folder: 'sent', icon: 'send' },
    { folder: 'drafts', icon: 'draft' },
    { folder: 'archive', icon: 'archive' },
    { folder: 'trash', icon: 'trash' },
  ];

  readonly sidebarOpen = signal(false);
  readonly menuOpen = signal(false);

  private readonly url = toSignal(
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map(() => this.router.url)),
    { initialValue: this.router.url },
  );
  /** Dossier courant, utilisé par la recherche */
  readonly currentFolder = computed(() => (this.url().match(/^\/mail\/(\w+)/)?.[1] as Folder) ?? 'inbox');
  readonly currentQuery = computed(() => new URLSearchParams(this.url().split('?')[1] ?? '').get('q') ?? '');

  ngOnInit(): void {
    this.mail.refreshCounts();
    this.realtime.connect();
    this.auth.refreshMe().subscribe({ error: () => undefined });
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      this.sidebarOpen.set(false);
      this.menuOpen.set(false);
    });
  }

  ngOnDestroy(): void {
    this.realtime.disconnect();
  }

  search(q: string): void {
    this.router.navigate(['/mail', this.currentFolder()], { queryParams: q.trim() ? { q: q.trim() } : {} });
  }
}
