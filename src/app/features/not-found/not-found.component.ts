import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="nf">
      <div class="code">404</div>
      <h1>Page introuvable</h1>
      <p class="muted">La page demandée n'existe pas ou a été déplacée.</p>
      <a class="btn primary" routerLink="/mail/inbox">Retour à la boîte de réception</a>
    </div>
  `,
  styles: `
    .nf { min-height: 70vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; text-align: center; padding: 24px; }
    .code { font-size: 96px; font-weight: 800; color: var(--primary); line-height: 1; opacity: .85; }
    p { margin: 0 0 12px; }
  `,
})
export class NotFoundComponent {}
