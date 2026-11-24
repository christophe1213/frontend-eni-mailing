import { Component, ElementRef, forwardRef, HostListener, inject, Injector, input, OnDestroy, OnInit, signal, viewChild } from '@angular/core';
import { AbstractControl, ControlValueAccessor, NG_VALIDATORS, NG_VALUE_ACCESSOR, NgControl, ValidationErrors, Validator } from '@angular/forms';
import {
  COUNTRIES, Country, countryByIso, DEFAULT_COUNTRY, detectCountry, formatLocal, formatNational, localLength, MOBILE_PREFIXES, phoneIssue, toDraftValue, toLocalDigits,
} from './phone';
import { FlagComponent } from './flag.component';

const OPERATOR_MESSAGE = `Numéro non reconnu : il doit commencer par ${MOBILE_PREFIXES.join(', ').replace(/, (?=[^,]*$)/, ' ou ')}.`;

/**
 * Champ téléphone avec sélecteur de pays, utilisable avec formControlName ou ngModel.
 * - sélecteur d'indicatif (Madagascar +261 par défaut), reconnu aussi automatiquement à partir d'un numéro collé (« +33… », « 0033… »)
 * - masque et formatage automatiques selon le pays : « 034 12 345 67 » (Madagascar), « 06 12 34 56 78 » (France)…
 * - valeur du formulaire = numéro international « +261341234567 » (un numéro incomplet reste « +indicatif + chiffres » et rend le champ invalide)
 * - collage nettoyé : espaces, tirets, parenthèses, « +261 », « 00261 » et « 261 » acceptés
 * - validation en temps réel : chiffres uniquement, opérateur (Madagascar), longueur
 * - clavier numérique sur mobile (inputmode="tel")
 * Détection de changement par défaut (et non OnPush) pour refléter l'état « touché » du contrôle posé par le formulaire parent.
 */
@Component({
  selector: 'app-phone-input',
  imports: [FlagComponent],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PhoneInputComponent), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => PhoneInputComponent), multi: true },
  ],
  template: `
    <div class="row">
      <div class="cc-wrap">
        <button #btn type="button" class="cc" [disabled]="disabled()" aria-haspopup="listbox" [attr.aria-expanded]="open()" [attr.aria-controls]="inputId() + '-list'"
                [attr.aria-activedescendant]="open() ? inputId() + '-opt-' + countries[active()].iso : null"
                [attr.aria-label]="'Pays : ' + country().name + ', indicatif +' + country().dial" (click)="toggle()" (keydown)="onKey($event)">
          <app-flag [iso]="country().iso" />
          <span class="cc-code">+{{ country().dial }}</span>
          <svg class="cc-caret" viewBox="0 0 10 6" width="10" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
        @if (open()) {
          <ul class="cc-list" role="listbox" aria-label="Pays" [id]="inputId() + '-list'" [style.left.px]="pos().left" [style.top.px]="pos().top"
              [style.bottom.px]="pos().bottom" [style.max-height.px]="pos().maxHeight">
            @for (c of countries; track c.iso; let i = $index) {
              <li role="option" [id]="inputId() + '-opt-' + c.iso" [attr.aria-selected]="c.iso === country().iso" [class.active]="i === active()" [class.selected]="c.iso === country().iso"
                  (mousedown)="$event.preventDefault()" (click)="pick(i)" (mouseenter)="active.set(i)">
                <app-flag [iso]="c.iso" />
                <span class="cc-name">{{ c.name }}</span>
                <span class="cc-dial">+{{ c.dial }}</span>
              </li>
            }
          </ul>
        }
      </div>
      <input #field [id]="inputId()" class="input" type="tel" inputmode="tel" autocomplete="tel-national" [placeholder]="country().example"
             [value]="display()" [disabled]="disabled()" [class.invalid]="!!message" [attr.aria-invalid]="message ? 'true' : null"
             [attr.aria-describedby]="inputId() + '-msg'" (input)="onInput($event)" (blur)="onBlur()" />
    </div>
    <span class="msg" [id]="inputId() + '-msg'">
      @if (message; as m) {
        <span class="error" role="alert">{{ m }}</span>
      } @else if (local() && !issue()) {
        <span class="hint ok">Enregistré au format international : +{{ country().dial }} {{ international() }}</span>
      } @else {
        <span class="hint">Ex. {{ country().example }} · l'indicatif +{{ country().dial }} est ajouté automatiquement.</span>
      }
    </span>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 6px; }
    .row { display: flex; gap: 8px; }
    .input { flex: 1; min-width: 0; height: var(--phone-input-h, 38px); letter-spacing: .02em; }
    .input.invalid, :host(.ng-invalid.ng-touched) .input { border-color: var(--danger); }
    .input.invalid:focus { box-shadow: 0 0 0 3px rgb(220 38 38 / 14%); }
    /* Sélecteur de pays : bouton « drapeau +261 » et liste déroulante (position fixe pour ne pas être coupée par une modale) */
    .cc-wrap { flex: none; }
    .cc { display: inline-flex; align-items: center; gap: 8px; height: var(--phone-input-h, 38px); padding: 0 10px 0 12px; border: 1px solid var(--border); border-radius: 8px;
      background: var(--surface); color: var(--text); font: inherit; font-weight: 500; white-space: nowrap; cursor: pointer; }
    .cc:hover:not(:disabled) { background: var(--surface-2); }
    .cc:focus-visible, .cc[aria-expanded='true'] { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgb(var(--primary-rgb) / 12%); }
    .cc:disabled { cursor: not-allowed; opacity: .6; }
    .cc-caret { color: var(--muted); }
    .cc-list { position: fixed; z-index: 200; width: 280px; max-width: calc(100vw - 16px); margin: 0; padding: 4px; overflow-y: auto; list-style: none;
      background: var(--surface); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 12px 32px rgb(15 23 42 / 18%); }
    .cc-list li { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 6px; cursor: pointer; }
    .cc-list li.active { background: var(--surface-2); }
    .cc-list li.selected { background: var(--primary-50); color: var(--primary-600); font-weight: 600; }
    .cc-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cc-dial { color: var(--muted); font-variant-numeric: tabular-nums; }
    .error, .hint { font-size: 12px; }
    .error { color: var(--danger); }
    .hint { color: var(--muted); }
    .hint.ok { color: var(--success); }
  `,
})
export class PhoneInputComponent implements ControlValueAccessor, Validator, OnInit, OnDestroy {
  /** id de l'input, pour le `<label for>` du parent */
  readonly inputId = input('phone');
  readonly countries = COUNTRIES;

  /** Pays sélectionné (Madagascar par défaut) */
  readonly country = signal<Country>(DEFAULT_COUNTRY);
  /** Chiffres locaux saisis, préfixe national (0) inclus (« 0341234567 ») */
  readonly local = signal('');
  readonly disabled = signal(false);
  private readonly badChars = signal(false);
  private readonly blurred = signal(false);
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');
  private readonly btn = viewChild.required<ElementRef<HTMLButtonElement>>('btn');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Liste des pays ouverte, pays survolé / pointé au clavier, et position de la liste (fixe, calculée à l'ouverture) */
  readonly open = signal(false);
  readonly active = signal(0);
  readonly pos = signal<{ left: number; top: number | null; bottom: number | null; maxHeight: number }>({ left: 0, top: 0, bottom: null, maxHeight: 280 });
  private readonly closeOnScroll = (e: Event) => { if (!(e.target as Element | null)?.closest?.('.cc-list')) this.close(); };

  private ngControl: NgControl | null = null;
  private readonly injector = inject(Injector);
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  ngOnInit(): void {
    // Injection différée : injecter NgControl dans le constructeur créerait une dépendance circulaire avec NG_VALIDATORS
    this.ngControl = this.injector.get(NgControl, null);
  }

  ngOnDestroy(): void { this.close(); }

  display(): string { return formatLocal(this.local(), this.country()); }
  issue(): 'length' | 'operator' | 'country' | null { return phoneIssue(this.local(), this.country()); }
  /** Numéro sans le préfixe national, regroupé selon le pays : « 34 12 345 67 » */
  international(): string { return formatNational(this.local(), this.country()); }

  /** Message sous le champ : opérateur et caractères refusés tout de suite, longueur une fois le champ quitté (ou le formulaire soumis) */
  get message(): string | null {
    if (this.badChars()) return 'Chiffres uniquement : les lettres et symboles sont ignorés.';
    const issue = this.issue();
    if (issue === 'operator') return OPERATOR_MESSAGE;
    if (issue === 'length' && (this.blurred() || this.ngControl?.touched)) {
      const c = this.country();
      return `Numéro incomplet : ${localLength(c)} chiffres attendus (ex. ${c.example}).`;
    }
    return null;
  }

  onInput(e: Event): void {
    const el = e.target as HTMLInputElement;
    const raw = el.value;
    const caret = el.selectionStart ?? raw.length;
    const toEnd = caret >= raw.length || (e as InputEvent).inputType === 'insertFromPaste';
    const digitsBefore = raw.slice(0, caret).replace(/\D/g, '').length;

    // Numéro international collé ou saisi (« +33… », « 0033… ») : le pays suit l'indicatif
    const detected = detectCountry(raw);
    if (detected && detected !== this.country()) this.country.set(detected);
    const country = this.country();

    this.badChars.set(/[^\d\s+().\-]/.test(raw));
    const local = toLocalDigits(raw, true, country);
    this.local.set(local);
    const shown = formatLocal(local, country);
    el.value = shown; // réécrit même si la valeur affichée n'a pas changé (lettre refusée)

    let pos = shown.length;
    if (!toEnd) {
      let seen = 0;
      pos = 0;
      while (pos < shown.length && seen < digitsBefore) { if (/\d/.test(shown[pos])) seen++; pos++; }
    }
    try { el.setSelectionRange(pos, pos); } catch { /* sélection non supportée */ }

    this.onChange(toDraftValue(local, country));
  }

  toggle(): void { this.open() ? this.close() : this.openList(); }

  private openList(): void {
    if (this.disabled()) return;
    const r = this.btn().nativeElement.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 200 && above > below; // pas assez de place dessous : la liste s'ouvre vers le haut
    this.pos.set({
      left: Math.max(8, Math.min(r.left, window.innerWidth - 288)),
      top: up ? null : r.bottom + 4,
      bottom: up ? window.innerHeight - r.top + 4 : null,
      maxHeight: Math.min(300, up ? above : below),
    });
    this.active.set(Math.max(0, this.countries.findIndex((c) => c.iso === this.country().iso)));
    this.open.set(true);
    document.addEventListener('scroll', this.closeOnScroll, true);
    this.reveal();
  }

  private close(): void {
    document.removeEventListener('scroll', this.closeOnScroll, true);
    this.open.set(false);
  }

  private reveal(): void {
    setTimeout(() => document.getElementById(this.inputId() + '-opt-' + this.countries[this.active()].iso)?.scrollIntoView({ block: 'nearest' }));
  }

  /** Clavier sur le bouton : flèches / Début / Fin pour se déplacer, Entrée ou Espace pour choisir, Échap pour fermer, une lettre pour sauter à un pays */
  onKey(e: KeyboardEvent): void {
    const last = this.countries.length - 1;
    if (!this.open()) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); this.openList(); }
      return;
    }
    const go = (i: number) => { e.preventDefault(); this.active.set(Math.max(0, Math.min(last, i))); this.reveal(); };
    switch (e.key) {
      case 'ArrowDown': return go(this.active() + 1);
      case 'ArrowUp': return go(this.active() - 1);
      case 'Home': return go(0);
      case 'End': return go(last);
      case 'Enter': case ' ': e.preventDefault(); return this.pick(this.active());
      case 'Escape': e.preventDefault(); return this.close();
      case 'Tab': return this.close();
    }
    if (e.key.length === 1 && /\p{L}/u.test(e.key)) {
      const i = this.countries.findIndex((c) => c.name.toLowerCase().startsWith(e.key.toLowerCase()));
      if (i >= 0) go(i);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: Event): void {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) this.close();
  }

  @HostListener('window:resize')
  onResize(): void { this.close(); }

  pick(index: number): void {
    this.close();
    this.btn().nativeElement.focus();
    this.onCountry(this.countries[index].iso);
  }

  /** Changement de pays : les chiffres déjà saisis sont conservés, réinterprétés avec le préfixe national du nouveau pays */
  private onCountry(iso: string): void {
    const prev = this.country();
    const next = countryByIso(iso);
    if (next === prev) { this.field().nativeElement.focus(); return; }
    this.country.set(next);
    this.badChars.set(false);
    const old = this.local();
    const nsn = old.startsWith('00') ? '' : old.slice(prev.trunk.length);
    const local = old ? (next.trunk + nsn).slice(0, localLength(next)) : '';
    this.local.set(local);
    this.onChange(toDraftValue(local, next));
    this.field().nativeElement.focus();
  }

  onBlur(): void {
    this.blurred.set(true);
    this.badChars.set(false);
    this.onTouched();
  }

  writeValue(value: string | null): void {
    // Valeur internationale → le pays est déduit de l'indicatif ; valeur locale ou vide (ex. reset) → Madagascar
    const country = detectCountry(value) ?? DEFAULT_COUNTRY;
    this.country.set(country);
    this.local.set(toLocalDigits(value, true, country));
    this.badChars.set(false);
  }
  registerOnChange(fn: (value: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.disabled.set(isDisabled); }

  validate(control: AbstractControl): ValidationErrors | null {
    const issue = phoneIssue(control.value, this.country());
    return issue ? { phone: issue } : null;
  }
}
