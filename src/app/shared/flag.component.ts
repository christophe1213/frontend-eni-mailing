import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Drapeau d'un pays (code ISO de `COUNTRIES`) en SVG intégré : s'affiche partout, y compris sous Windows où les emoji-drapeaux ne s'affichent pas */
@Component({
  selector: 'app-flag',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 30 20" width="22" height="15" aria-hidden="true" focusable="false">
      @switch (iso()) {
        @case ('MG') {
          <rect width="30" height="20" fill="#fff" />
          <rect x="10" width="20" height="10" fill="#fc3d32" />
          <rect x="10" y="10" width="20" height="10" fill="#007e3a" />
        }
        @case ('FR') {
          <rect width="10" height="20" fill="#002654" />
          <rect x="10" width="10" height="20" fill="#fff" />
          <rect x="20" width="10" height="20" fill="#ce1126" />
        }
        @case ('RE') {
          <rect width="10" height="20" fill="#002654" />
          <rect x="10" width="10" height="20" fill="#fff" />
          <rect x="20" width="10" height="20" fill="#ce1126" />
        }
        @case ('KM') {
          <rect width="30" height="5" fill="#ffc61e" />
          <rect y="5" width="30" height="5" fill="#fff" />
          <rect y="10" width="30" height="5" fill="#ce1126" />
          <rect y="15" width="30" height="5" fill="#3a75c4" />
          <path d="M0 0L12 10L0 20Z" fill="#3d8e33" />
          <circle cx="4.6" cy="10" r="3" fill="#fff" />
          <circle cx="5.6" cy="10" r="2.5" fill="#3d8e33" />
        }
        @case ('MU') {
          <rect width="30" height="5" fill="#ea2839" />
          <rect y="5" width="30" height="5" fill="#1a206d" />
          <rect y="10" width="30" height="5" fill="#ffd500" />
          <rect y="15" width="30" height="5" fill="#00a551" />
        }
        @case ('SN') {
          <rect width="10" height="20" fill="#00853f" />
          <rect x="10" width="10" height="20" fill="#fdef42" />
          <rect x="20" width="10" height="20" fill="#e31b23" />
          <polygon points="15.00,6.40 15.85,8.83 18.42,8.89 16.38,10.45 17.12,12.91 15.00,11.45 12.88,12.91 13.62,10.45 11.58,8.89 14.15,8.83" fill="#00853f" />
        }
        @case ('CI') {
          <rect width="10" height="20" fill="#f77f00" />
          <rect x="10" width="10" height="20" fill="#fff" />
          <rect x="20" width="10" height="20" fill="#009e60" />
        }
        @case ('CM') {
          <rect width="10" height="20" fill="#007a5e" />
          <rect x="10" width="10" height="20" fill="#ce1126" />
          <rect x="20" width="10" height="20" fill="#fcd116" />
          <polygon points="15.00,6.40 15.85,8.83 18.42,8.89 16.38,10.45 17.12,12.91 15.00,11.45 12.88,12.91 13.62,10.45 11.58,8.89 14.15,8.83" fill="#fcd116" />
        }
        @case ('MA') {
          <rect width="30" height="20" fill="#c1272d" />
          <polygon points="15.00,5.40 17.70,13.72 10.63,8.58 19.37,8.58 12.30,13.72" fill="none" stroke="#006233" stroke-width="0.9" stroke-linejoin="miter" />
        }
        @case ('GB') {
          <rect width="30" height="20" fill="#012169" />
          <path d="M0 0L30 20M30 0L0 20" stroke="#fff" stroke-width="3.4" />
          <path d="M0 0L30 20M30 0L0 20" stroke="#c8102e" stroke-width="1.2" />
          <path d="M15 0V20M0 10H30" stroke="#fff" stroke-width="6" />
          <path d="M15 0V20M0 10H30" stroke="#c8102e" stroke-width="3.4" />
        }
        @case ('US') {
          <rect width="30" height="20" fill="#b22234" />
          <path d="M0 1.54h30v1.54H0zM0 4.62h30v1.54H0zM0 7.69h30v1.54H0zM0 10.77h30v1.54H0zM0 13.85h30v1.54H0zM0 16.92h30v1.54H0z" fill="#fff" />
          <rect width="12" height="10.77" fill="#3c3b6e" />
        }
        @default {
          <rect width="30" height="20" fill="#e2e8f0" />
        }
      }
    </svg>
  `,
  styles: `
    :host { display: inline-flex; flex: none; border-radius: 3px; overflow: hidden; box-shadow: 0 0 0 1px rgb(15 23 42 / 18%); line-height: 0; }
    svg { display: block; }
  `,
})
export class FlagComponent {
  readonly iso = input.required<string>();
}
