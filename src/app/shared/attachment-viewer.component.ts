import {
  afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, inject, input,
  linkedSignal, output, signal, viewChild,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { errorMessage } from '../core/interceptors/http.interceptors';
import { Attachment } from '../core/models';
import { MailService } from '../core/services/mail.service';
import { ToastService } from '../core/services/toast.service';
import { PreviewInfo, previewInfo, typeLabel } from './attachment-preview';
import { IconComponent } from './icon.component';
import { FileSizePipe } from './pipes';

/** Au-delà, l'aperçu texte est tronqué (le fichier reste téléchargeable en entier) */
const MAX_TEXT_CHARS = 200_000;

type ViewState = 'loading' | 'ready' | 'error' | 'unsupported';

/**
 * Visionneuse modale de pièces jointes : PDF, images, texte ; repli « Télécharger » pour les autres types.
 *
 * Sécurité :
 *  - le contenu est récupéré par le flux authentifié de l'API (jeton JWT) : l'API décide de l'accès
 *    (expéditeur ou destinataire uniquement) ; aucune URL publique n'est exposée ;
 *  - le Blob est recréé avec un type MIME de la liste blanche (pdf / image raster / texte), jamais celui du serveur ;
 *  - le texte est affiché par interpolation Angular (échappé) ; SVG et HTML ne sont jamais interprétés.
 */
@Component({
  selector: 'app-attachment-viewer',
  imports: [IconComponent, FileSizePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
  template: `
    <div class="backdrop" (click)="closed.emit()">
      <div class="dialog" #dialog tabindex="-1" role="dialog" aria-modal="true"
           [attr.aria-label]="'Aperçu de ' + (file()?.fileName ?? '')" (click)="$event.stopPropagation()">
        @if (file(); as f) {
          <header class="bar">
            <div class="meta">
              <span class="fname" [title]="f.fileName">{{ f.fileName }}</span>
              <span class="sub">{{ typeText() }} · {{ f.size | fileSize }} · {{ f.mimeType }}</span>
            </div>
            @if (files().length > 1) {
              <div class="nav">
                <button class="icon-btn" (click)="go(-1)" [disabled]="index() === 0" title="Fichier précédent" aria-label="Fichier précédent"><app-icon name="chevron-left" /></button>
                <span class="count">{{ index() + 1 }} / {{ files().length }}</span>
                <button class="icon-btn" (click)="go(1)" [disabled]="index() === files().length - 1" title="Fichier suivant" aria-label="Fichier suivant"><app-icon name="chevron-right" /></button>
              </div>
            }
            <button class="btn sm" (click)="download()"><app-icon name="download" [size]="16" /> Télécharger</button>
            <button class="icon-btn" (click)="closed.emit()" title="Fermer" aria-label="Fermer"><app-icon name="x" /></button>
          </header>

          <div class="stage">
            @switch (state()) {
              @case ('loading') { <div class="spinner"></div> }
              @case ('error') {
                <div class="empty">
                  <div class="empty-icon"><app-icon name="alert" [size]="28" /></div>
                  <p>{{ error() }}</p>
                </div>
              }
              @case ('unsupported') {
                <div class="empty">
                  <div class="empty-icon"><app-icon name="file-text" [size]="28" /></div>
                  <p>Aucun aperçu n'est disponible pour ce type de fichier.</p>
                  <button class="btn primary" (click)="download()"><app-icon name="download" [size]="16" /> Télécharger</button>
                </div>
              }
              @default {
                @if (pdfUrl(); as u) {
                  <iframe class="pdf" [src]="u" [title]="f.fileName" referrerpolicy="no-referrer"></iframe>
                } @else if (imageUrl(); as u) {
                  <img [src]="u" [alt]="f.fileName" (error)="onImageError()" />
                } @else {
                  <pre class="text">{{ text() || '(fichier vide)' }}</pre>
                  @if (truncated()) { <p class="cut">Aperçu tronqué — téléchargez le fichier pour le lire en entier.</p> }
                }
              }
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    .backdrop { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; padding: 20px; background: rgb(15 23 42 / 65%); }
    .dialog { display: flex; flex-direction: column; width: min(1100px, 100%); height: min(92vh, 100%); background: var(--surface);
      border-radius: 12px; box-shadow: var(--shadow); overflow: hidden; outline: none; }
    .bar { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid var(--border); }
    .meta { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .fname { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sub { font-size: 12px; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .nav { display: flex; align-items: center; gap: 2px; .count { font-size: 12px; color: var(--text-2); min-width: 40px; text-align: center; } }
    .icon-btn:disabled { opacity: .35; cursor: default; background: transparent; }
    .stage { flex: 1; min-height: 0; display: grid; place-items: center; background: var(--surface-2); overflow: auto; }
    .pdf { width: 100%; height: 100%; border: 0; background: #fff; }
    img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .text { margin: 0; padding: 16px 20px; width: 100%; align-self: start; text-align: left; white-space: pre-wrap; overflow-wrap: anywhere;
      font: 13px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--text); background: var(--surface); }
    .cut { align-self: end; margin: 0; padding: 8px 16px; font-size: 12px; color: var(--text-2); }
    @media (max-width: 640px) {
      .backdrop { padding: 0; } .dialog { border-radius: 0; height: 100%; }
      .bar { flex-wrap: wrap; } .meta { flex-basis: 100%; order: -1; }
    }
  `,
})
export class AttachmentViewerComponent {
  private mail = inject(MailService);
  private toast = inject(ToastService);
  private sanitizer = inject(DomSanitizer);

  readonly files = input.required<Attachment[]>();
  readonly startIndex = input(0);
  readonly closed = output<void>();

  readonly index = linkedSignal(() => this.startIndex());
  readonly file = computed<Attachment | null>(() => this.files()[this.index()] ?? null);
  readonly typeText = computed(() => (this.file() ? typeLabel(this.file()!) : ''));

  readonly state = signal<ViewState>('loading');
  readonly error = signal('');
  readonly pdfUrl = signal<SafeResourceUrl | null>(null);
  readonly imageUrl = signal<string | null>(null);
  readonly text = signal('');
  readonly truncated = signal(false);

  private dialog = viewChild<ElementRef<HTMLElement>>('dialog');
  private raw: Blob | null = null;
  private objectUrl: string | null = null;

  constructor() {
    // Charge l'aperçu à chaque changement de fichier ; la requête en cours est annulée si on change vite
    effect((onCleanup) => {
      const f = this.file();
      this.clear();
      if (!f) return;
      const info = previewInfo(f);
      if (!info) {
        this.state.set('unsupported');
        return;
      }
      this.state.set('loading');
      const sub = this.mail.fetchAttachment(f).subscribe({
        next: (blob) => this.show(f, blob, info),
        error: (e) => this.fail(errorMessage(e)),
      });
      onCleanup(() => sub.unsubscribe());
    });

    // Bloque le défilement de la page derrière la modale + focus pour le clavier
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    afterNextRender(() => this.dialog()?.nativeElement.focus());
    inject(DestroyRef).onDestroy(() => {
      document.body.style.overflow = previous;
      this.clear();
    });
  }

  onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') this.closed.emit();
    else if (e.key === 'ArrowLeft') this.go(-1);
    else if (e.key === 'ArrowRight') this.go(1);
  }

  go(step: number): void {
    const next = this.index() + step;
    if (next >= 0 && next < this.files().length) this.index.set(next);
  }

  download(): void {
    const f = this.file();
    if (!f) return;
    if (this.raw) {
      this.mail.saveBlob(this.raw, f.fileName);
      return;
    }
    this.mail.downloadAttachment(f).subscribe({ error: (e) => this.toast.error(errorMessage(e)) });
  }

  onImageError(): void {
    this.fail("Impossible d'afficher cette image.");
  }

  private show(f: Attachment, blob: Blob, info: PreviewInfo): void {
    this.raw = blob;
    // Type MIME imposé par la liste blanche, pas celui du serveur
    const typed = new Blob([blob], { type: info.mime });
    if (info.kind === 'text') {
      typed.text().then((t) => {
        if (this.file() !== f) return; // l'utilisateur a changé de fichier entre-temps
        this.truncated.set(t.length > MAX_TEXT_CHARS);
        this.text.set(t.slice(0, MAX_TEXT_CHARS));
        this.state.set('ready');
      });
      return;
    }
    this.objectUrl = URL.createObjectURL(typed);
    if (info.kind === 'pdf') this.pdfUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl));
    else this.imageUrl.set(this.objectUrl);
    this.state.set('ready');
  }

  private fail(message: string): void {
    this.error.set(message);
    this.state.set('error');
  }

  private clear(): void {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
    this.raw = null;
    this.pdfUrl.set(null);
    this.imageUrl.set(null);
    this.text.set('');
    this.truncated.set(false);
    this.error.set('');
  }
}
