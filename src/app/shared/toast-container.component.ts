import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Toast, ToastService } from '../core/services/toast.service';

@Component({
  selector: 'app-toast-container',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toasts" aria-live="polite">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast" [class]="t.kind" (click)="open(t)">{{ t.text }}</div>
      }
    </div>
  `,
  styles: `
    .toasts { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; gap: 8px; z-index: 200; width: max-content; max-width: calc(100vw - 32px); }
    .toast { padding: 11px 18px; border-radius: 8px; color: #fff; background: #1e293b; box-shadow: var(--shadow); cursor: pointer; animation: up .2s ease-out; }
    .toast.success { background: #15803d; }
    .toast.error { background: #b91c1c; }
    @keyframes up { from { opacity: 0; transform: translateY(8px); } }
  `,
})
export class ToastContainerComponent {
  readonly toast = inject(ToastService);

  open(t: Toast): void {
    this.toast.dismiss(t.id);
    t.onClick?.();
  }
}
