import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { UserSummary } from '../core/models';

const COLORS = ['#15803d', '#7c3aed', '#db2777', '#ea580c', '#0d9488', '#16a34a', '#0891b2', '#9333ea'];

/** Pastille avec initiales, couleur stable par utilisateur */
@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (photo(); as src) {
      <img class="avatar" [src]="src" [alt]="label()" [style.width.px]="size()" [style.height.px]="size()" (error)="failed.set(src)" />
    } @else {
      <span class="avatar" [style.background]="color()" [style.width.px]="size()" [style.height.px]="size()"
        [style.font-size.px]="size() * 0.4" [attr.aria-label]="label()">{{ initials() }}</span>
    }`,
  styles: `.avatar { display: inline-grid; place-items: center; border-radius: 50%; color: #fff; font-weight: 600; flex-shrink: 0; user-select: none; }
    img.avatar { object-fit: cover; display: inline-block; }`,
})
export class AvatarComponent {
  readonly user = input.required<(Pick<UserSummary, 'id' | 'firstName' | 'lastName'> & { avatarUrl?: string | null }) | null>();
  readonly size = input(36);
  /** URL dont le chargement a échoué : on retombe sur les initiales */
  readonly failed = signal<string | null>(null);
  readonly photo = computed(() => {
    const url = this.user()?.avatarUrl;
    return url && url !== this.failed() ? url : null;
  });

  readonly initials = computed(() => {
    const u = this.user();
    return u ? `${u.firstName[0] ?? ''}${u.lastName[0] ?? ''}`.toUpperCase() : '?';
  });
  readonly color = computed(() => COLORS[(this.user()?.id ?? 0) % COLORS.length]);
  readonly label = computed(() => (this.user() ? `${this.user()!.firstName} ${this.user()!.lastName}` : ''));
}
