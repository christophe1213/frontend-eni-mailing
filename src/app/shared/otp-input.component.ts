import {
  AfterViewInit, ChangeDetectionStrategy, Component, computed, ElementRef, input, model, output, viewChildren,
} from '@angular/core';
import { OTP_LENGTH } from './cooldown';

/**
 * Saisie d'un code à usage unique, une case par chiffre.
 * - saisie, suppression (Retour arrière / Suppr.), flèches, collage et saisie automatique « code e-mail / SMS » ;
 * - `[(value)]` porte la chaîne de chiffres ; `(completed)` est émis dès que le code est complet.
 *
 *   <app-otp-input [(value)]="code" [disabled]="loading()" (completed)="verify()" />
 */
@Component({
  selector: 'app-otp-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="otp" role="group" [attr.aria-label]="label()">
      @for (i of slots(); track i) {
        <input
          #cell
          class="cell"
          type="text"
          inputmode="numeric"
          [attr.autocomplete]="i === 0 ? 'one-time-code' : 'off'"
          [attr.aria-label]="'Chiffre ' + (i + 1) + ' sur ' + length()"
          [value]="digits()[i]"
          [disabled]="disabled()"
          [class.filled]="!!digits()[i]"
          [class.invalid]="invalid()"
          (input)="onInput(i, $event)"
          (keydown)="onKeydown(i, $event)"
          (paste)="onPaste($event)"
          (focus)="onFocus($event)"
        />
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .otp { display: flex; justify-content: center; gap: 8px; }
    .cell {
      width: 46px; height: 56px; padding: 0; text-align: center; font: inherit; font-size: 24px; font-weight: 600;
      font-variant-numeric: tabular-nums; color: var(--text); background: var(--surface);
      border: 1px solid var(--border); border-radius: 10px; outline: none; caret-color: var(--primary);
      transition: border-color .15s, box-shadow .15s, background-color .15s;
    }
    .cell:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgb(var(--primary-rgb) / 14%); }
    .cell.filled { background: var(--primary-50); border-color: var(--primary-200); }
    .cell.invalid { border-color: var(--danger); background: var(--danger-50); }
    .cell:disabled { opacity: .6; cursor: not-allowed; }
    @media (max-width: 420px) { .otp { gap: 6px; } .cell { width: 40px; height: 50px; font-size: 21px; } }
  `,
})
export class OtpInputComponent implements AfterViewInit {
  /** Nombre de chiffres du code */
  readonly length = input(OTP_LENGTH);
  readonly label = input('Code de vérification');
  readonly disabled = input(false);
  readonly invalid = input(false);
  /** Place le curseur dans la première case à l'affichage */
  readonly autofocus = input(false);

  /** Chiffres saisis (sans espace), de 0 à `length` caractères */
  readonly value = model('');
  readonly completed = output<string>();

  protected readonly slots = computed(() => Array.from({ length: this.length() }, (_, i) => i));
  protected readonly digits = computed(() => this.slots().map((i) => this.value()[i] ?? ''));
  private readonly cells = viewChildren<ElementRef<HTMLInputElement>>('cell');

  ngAfterViewInit(): void {
    if (this.autofocus()) this.focus();
  }

  /** Place le curseur sur la première case libre (utile après un effacement du code) */
  focus(): void {
    this.focusCell(Math.min(this.value().length, this.length() - 1));
  }

  protected onInput(i: number, ev: Event): void {
    const el = ev.target as HTMLInputElement;
    const current = this.value();
    let typed = el.value.replace(/\D/g, '');

    if (!typed) {
      // Suppression par le système (menu contextuel, clavier mobile) : on retire le chiffre de cette case
      this.update(current.slice(0, i) + current.slice(i + 1));
      el.value = this.digits()[i];
      return;
    }
    // Case déjà remplie + nouveau chiffre = « 52 » : on ne garde que le nouveau
    if (typed.length === 2 && current[i]) typed = typed.replace(current[i], '');

    const pos = Math.min(i, current.length);
    const next = (current.slice(0, pos) + typed + current.slice(pos + typed.length)).slice(0, this.length());
    this.update(next);
    el.value = this.digits()[i];
    this.focusCell(Math.min(pos + typed.length, this.length() - 1));
  }

  protected onKeydown(i: number, ev: KeyboardEvent): void {
    const current = this.value();
    switch (ev.key) {
      case 'Backspace': {
        ev.preventDefault();
        // Case vide : on efface le chiffre précédent ; sinon celui de la case courante
        const at = current[i] ? i : i - 1;
        if (at >= 0) this.update(current.slice(0, at) + current.slice(at + 1));
        this.focusCell(Math.max(at, 0));
        break;
      }
      case 'Delete':
        ev.preventDefault();
        this.update(current.slice(0, i) + current.slice(i + 1));
        break;
      case 'ArrowLeft':
        ev.preventDefault();
        this.focusCell(i - 1);
        break;
      case 'ArrowRight':
        ev.preventDefault();
        this.focusCell(i + 1);
        break;
    }
  }

  protected onPaste(ev: ClipboardEvent): void {
    ev.preventDefault();
    const pasted = (ev.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, this.length());
    if (!pasted) return;
    this.update(pasted);
    this.focusCell(Math.min(pasted.length, this.length() - 1));
  }

  protected onFocus(ev: FocusEvent): void {
    (ev.target as HTMLInputElement).select();
  }

  private update(next: string): void {
    const changed = next !== this.value();
    this.value.set(next);
    if (changed && next.length === this.length()) this.completed.emit(next);
  }

  private focusCell(i: number): void {
    this.cells()[Math.max(0, Math.min(i, this.length() - 1))]?.nativeElement.focus();
  }
}
