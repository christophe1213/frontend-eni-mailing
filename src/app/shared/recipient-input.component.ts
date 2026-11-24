import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { MailGroup, UserSummary } from '../core/models';
import { IconComponent } from './icon.component';

export interface RecipientChip {
  kind: 'user' | 'group';
  id: number;
  label: string;
  sub: string;
  /** Suggestion issue du carnet de contacts personnel */
  contact?: boolean;
  /** Destinataire imposé (ex. expéditeur d'un message auquel on répond) : ne peut pas être retiré */
  locked?: boolean;
}

export const userChip = (u: UserSummary): RecipientChip =>
  ({ kind: 'user', id: u.id, label: `${u.firstName} ${u.lastName}`, sub: u.email });
export const groupChip = (g: MailGroup): RecipientChip =>
  ({ kind: 'group', id: g.id, label: g.name, sub: `${g.address} · ${g.memberCount} membres` });

/** Champ de saisie de destinataires avec autocomplétion (utilisateurs + listes de diffusion) */
@Component({
  selector: 'app-recipient-input',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap" (click)="field.focus()">
      <span class="lbl">{{ label() }}</span>
      @for (c of value(); track c.kind + c.id) {
        <span class="chip" [class.group]="c.kind === 'group'" [class.locked]="c.locked" [title]="c.locked ? c.sub + ' (destinataire de la réponse, non modifiable)' : c.sub">
          @if (c.kind === 'group') { <app-icon name="megaphone" [size]="13" /> }{{ c.label }}
          @if (c.locked) {
            <app-icon class="lock" name="lock" [size]="12" />
          } @else {
            <button type="button" (click)="remove(c); $event.stopPropagation()" aria-label="Retirer"><app-icon name="x" [size]="13" /></button>
          }
        </span>
      }
      <input #field [value]="query()" (input)="query.set(field.value); open.set(true)"
        (focus)="open.set(true)" (blur)="close()" (keydown)="onKey($event)"
        [placeholder]="value().length ? '' : placeholder()" autocomplete="off" />
    </div>
    @if (open() && suggestions().length) {
      <ul class="menu" role="listbox">
        @for (s of suggestions(); track s.kind + s.id; let i = $index) {
          <li [class.active]="i === cursor()" (mousedown)="pick(s); $event.preventDefault()" role="option">
            <strong>@if (s.kind === 'group') { <app-icon name="megaphone" [size]="13" /> }{{ s.label }}@if (s.contact) { <span class="tag"><app-icon name="book" [size]="11" /> Contact</span> }</strong>
            <span>{{ s.sub }}</span>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    :host { display: block; position: relative; }
    .wrap { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 42px; padding: 6px 0; border-bottom: 1px solid var(--border); cursor: text; }
    .lbl { color: var(--text-2); width: 36px; font-size: 13px; }
    input { flex: 1; min-width: 140px; border: 0; outline: none; font: inherit; background: transparent; color: var(--text); height: 28px; }
    .chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 4px 3px 10px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 999px; font-size: 13px; }
    .chip.group { background: var(--primary-50); border-color: var(--primary-200); color: var(--primary); }
    .chip button { border: 0; background: transparent; cursor: pointer; font-size: 15px; line-height: 1; color: inherit; padding: 0 4px; border-radius: 50%; }
    .chip button:hover { background: rgb(0 0 0 / 8%); }
    .chip.locked { padding-right: 10px; }
    .chip .lock { display: inline-flex; opacity: .5; }
    .menu { position: absolute; left: 36px; right: 0; top: 100%; z-index: 20; list-style: none; margin: 4px 0 0; padding: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; box-shadow: var(--shadow); max-height: 260px; overflow: auto; }
    .menu li { display: flex; flex-direction: column; padding: 8px 10px; border-radius: 6px; cursor: pointer; }
    .menu li span { font-size: 12px; color: var(--text-2); }
    .menu li .tag { display: inline-flex; align-items: center; gap: 3px; margin-left: 8px; padding: 0 6px; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--border); font-size: 11px; font-weight: 400; }
    .menu li.active, .menu li:hover { background: var(--primary-50); }
  `,
})
export class RecipientInputComponent {
  readonly label = input('À');
  readonly placeholder = input('Nom, e-mail ou liste de diffusion…');
  readonly users = input<UserSummary[]>([]);
  readonly groups = input<MailGroup[]>([]);
  /** Contacts du carnet personnel (déjà associés à un compte), proposés en premier */
  readonly contacts = input<RecipientChip[]>([]);
  readonly allowGroups = input(true);
  readonly value = model<RecipientChip[]>([]);

  readonly query = signal('');
  readonly open = signal(false);
  readonly cursor = signal(0);

  readonly suggestions = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return [];
    const seen = new Set(this.value().map((c) => c.kind + c.id));
    // Les contacts passent avant les utilisateurs : un même compte n'est proposé qu'une fois
    const all = [
      ...this.contacts(),
      ...(this.allowGroups() ? this.groups().map(groupChip) : []),
      ...this.users().map(userChip),
    ];
    const out: RecipientChip[] = [];
    for (const c of all) {
      const key = c.kind + c.id;
      if (seen.has(key) || !(c.label.toLowerCase().includes(q) || c.sub.toLowerCase().includes(q))) continue;
      seen.add(key);
      out.push(c);
      if (out.length === 8) break;
    }
    return out;
  });

  pick(c: RecipientChip): void {
    this.value.update((v) => [...v, c]);
    this.query.set('');
    this.cursor.set(0);
  }

  remove(c: RecipientChip): void {
    if (c.locked) return;
    this.value.update((v) => v.filter((x) => !(x.kind === c.kind && x.id === c.id)));
  }

  close(): void {
    setTimeout(() => this.open.set(false), 120);
  }

  onKey(e: KeyboardEvent): void {
    const list = this.suggestions();
    if (e.key === 'ArrowDown') { e.preventDefault(); this.cursor.set(Math.min(this.cursor() + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.cursor.set(Math.max(this.cursor() - 1, 0)); }
    else if ((e.key === 'Enter' || e.key === 'Tab') && list.length) { e.preventDefault(); this.pick(list[this.cursor()]); }
    else if (e.key === 'Backspace' && !this.query()) {
      const last = this.value()[this.value().length - 1];
      if (last && !last.locked) this.value.update((v) => v.slice(0, -1));
    }
  }
}
