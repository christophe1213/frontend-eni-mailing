import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/icon.component';
import { ROLE_META } from './role-meta';

/** Inscription — étape 1 : choix du rôle à l'ENI */
@Component({
  selector: 'app-register-role',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="public-page">
      <div class="public-card narrow">
        <header class="public-head">
          <span class="pill">Nouveau compte</span>
          <h1>Quel est votre rôle à l’ENI ?</h1>
          <p>Les informations demandées seront adaptées à votre profil.</p>
        </header>

        <div class="grid">
          @for (r of roles; track r.role) {
            <a class="choice" [routerLink]="['/register', r.slug]">
              <span class="role-tile" [class]="'tone-' + r.tone"><app-icon [name]="r.icon" [size]="24" /></span>
              <span class="txt">
                <strong>{{ r.label }}</strong>
                <span>{{ r.registerHint }}</span>
                @if (r.role === 'ADMIN') { <span class="badge amber">Autorisation requise</span> }
              </span>
              <app-icon name="chevron-right" [size]="20" />
            </a>
          }
        </div>

        <hr />
        <p class="secure-note"><app-icon name="shield" [size]="16" /> Votre compte sera vérifié à partir des informations administratives de l'établissement.</p>
        <p class="back-line"><a class="back" routerLink="/login"><app-icon name="arrow-left" [size]="14" /> J'ai déjà un compte</a></p>
      </div>
    </div>
  `,
  styles: `
    .narrow { max-width: 760px; margin-top: 4vh; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; @media (max-width: 640px) { grid-template-columns: 1fr; } }
    .choice { display: flex; align-items: center; gap: 14px; min-height: 110px; padding: 16px; border: 1px solid var(--border); border-radius: 12px;
      color: var(--text); text-decoration: none !important; transition: border-color .15s, box-shadow .15s;
      &:hover { border-color: var(--primary); box-shadow: 0 6px 18px rgb(var(--primary-rgb) / 12%); }
      .txt { flex: 1; display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
        strong { font-size: 16px; } span { font-size: 12px; color: var(--text-2); } .badge { margin-top: 4px; color: #b45309; } }
      > app-icon { color: var(--text-2); }
    }
    hr { border: 0; border-top: 1px solid var(--border); margin: 22px 0 0; }
    .back-line { text-align: center; margin: 12px 0 0; font-size: 13px; }
  `,
})
export class RegisterRoleComponent {
  readonly roles = ROLE_META;
}
