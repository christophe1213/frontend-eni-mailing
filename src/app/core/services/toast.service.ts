import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  text: string;
  kind: 'success' | 'error' | 'info';
  /** Action déclenchée au clic (ex. ouvrir un message) */
  onClick?: () => void;
}

/** Notifications éphémères affichées en bas de l'écran */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private seq = 0;

  show(text: string, kind: Toast['kind'] = 'info', ms = 3500, onClick?: () => void): void {
    const id = ++this.seq;
    this.toasts.update((t) => [...t, { id, text, kind, onClick }]);
    setTimeout(() => this.dismiss(id), ms);
  }

  success(text: string): void { this.show(text, 'success'); }
  error(text: string): void { this.show(text, 'error', 5000); }

  dismiss(id: number): void {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }
}
