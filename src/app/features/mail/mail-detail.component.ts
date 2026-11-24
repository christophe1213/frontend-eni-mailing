import { ChangeDetectionStrategy, Component, computed, inject, input, OnChanges, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MailDetail } from '../../core/models';
import { errorMessage } from '../../core/interceptors/http.interceptors';
import { AuthService } from '../../core/services/auth.service';
import { ContactService } from '../../core/services/contact.service';
import { MailService } from '../../core/services/mail.service';
import { ToastService } from '../../core/services/toast.service';
import { AttachmentViewerComponent } from '../../shared/attachment-viewer.component';
import { AvatarComponent } from '../../shared/avatar.component';
import { FileSizePipe, FullNamePipe, MailDatePipe, RoleLabelPipe } from '../../shared/pipes';
import { IconComponent } from '../../shared/icon.component';

@Component({
  selector: 'app-mail-detail',
  imports: [IconComponent, RouterLink, AttachmentViewerComponent, AvatarComponent, MailDatePipe, FileSizePipe, FullNamePipe, RoleLabelPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mail-detail.component.html',
  styleUrl: './mail-detail.component.scss',
})
export class MailDetailComponent implements OnChanges {
  private mail = inject(MailService);
  private router = inject(Router);
  private toast = inject(ToastService);
  private auth = inject(AuthService);
  private contacts = inject(ContactService);

  // Paramètres de route liés via withComponentInputBinding()
  readonly folder = input.required<string>();
  readonly id = input.required<string>();

  readonly message = signal<MailDetail | null>(null);
  readonly error = signal('');
  readonly showAllRecipients = signal(false);
  /** Index de la pièce jointe ouverte dans la visionneuse (null = fermée) */
  readonly viewerIndex = signal<number | null>(null);

  /** Vrai une fois la présence de l'expéditeur dans le carnet vérifiée (évite un clignotement du bouton) */
  readonly contactChecked = signal(false);
  /** « Ajouter aux contacts » : proposé pour tout expéditeur autre que soi-même, une fois le carnet consulté */
  readonly canAddContact = computed(() => {
    const m = this.message();
    return !!m && this.contactChecked() && m.from.id !== this.auth.user()?.id;
  });
  readonly addingContact = signal(false);
  /** Vrai si l'expéditeur est déjà dans le carnet (détecté au chargement ou après ajout) */
  readonly contactAdded = signal(false);

  readonly to = computed(() => this.message()?.recipients.filter((r) => r.type === 'TO') ?? []);
  readonly cc = computed(() => this.message()?.recipients.filter((r) => r.type === 'CC') ?? []);
  readonly bcc = computed(() => this.message()?.recipients.filter((r) => r.type === 'BCC') ?? []);

  names(list: { user: { firstName: string; lastName: string; email: string } }[]): string {
    return list.map((r) => `${r.user.firstName} ${r.user.lastName} <${r.user.email}>`).join(', ');
  }

  ngOnChanges(): void {
    this.message.set(null);
    this.error.set('');
    this.viewerIndex.set(null);
    this.contactAdded.set(false);
    this.contactChecked.set(false);
    this.mail.get(Number(this.id())).subscribe({
      next: (m) => {
        this.message.set(m);
        this.checkContact(m);
      },
      error: (e) => this.error.set(errorMessage(e)),
    });
  }

  /** Interroge l'API : l'expéditeur est-il déjà dans mon carnet ? (en cas d'échec, on propose quand même l'ajout : le 409 fait foi) */
  private checkContact(m: MailDetail): void {
    const me = this.auth.user()?.id;
    if (!me || m.from.id === me) return;
    this.contacts.exists(me, m.from.id).subscribe({
      next: (r) => {
        if (this.message()?.id !== m.id) return; // le message affiché a changé entre-temps
        this.contactAdded.set(r.exists);
        this.contactChecked.set(true);
      },
      error: () => {
        if (this.message()?.id === m.id) this.contactChecked.set(true);
      },
    });
  }

  addContact(): void {
    const m = this.message();
    const me = this.auth.user()?.id;
    if (!m || !me) return;
    this.addingContact.set(true);
    this.contacts.add(me, m.from.id).subscribe({
      next: () => {
        this.addingContact.set(false);
        this.contactAdded.set(true);
        this.toast.success('Expéditeur ajouté à vos contacts');
      },
      error: (e) => {
        this.addingContact.set(false);
        // 409 : adresse déjà présente dans le carnet
        if (e?.status === 409) this.contactAdded.set(true);
        this.toast.show(e?.status === 409 ? 'Cet expéditeur est déjà dans vos contacts' : errorMessage(e), e?.status === 409 ? 'info' : 'error');
      },
    });
  }

  back(): void {
    this.router.navigate(['/mail', this.folder()]);
  }

  toggleStar(): void {
    const m = this.message()!;
    this.mail.update(m.id, { starred: !m.starred }).subscribe(() => this.message.set({ ...m, starred: !m.starred }));
  }

  markUnread(): void {
    this.mail.update(this.message()!.id, { read: false }).subscribe(() => {
      this.toast.show('Marqué comme non lu');
      this.back();
    });
  }

  archive(): void {
    this.mail.update(this.message()!.id, { folder: 'archive' }).subscribe(() => {
      this.toast.success('Message archivé');
      this.back();
    });
  }

  remove(): void {
    const m = this.message()!;
    if (m.folder === 'trash' && !confirm('Supprimer définitivement ce message ?')) return;
    this.mail.delete(m.id).subscribe({
      next: () => {
        this.toast.success(m.folder === 'trash' ? 'Message supprimé définitivement' : 'Message déplacé dans la corbeille');
        this.back();
      },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  restore(): void {
    this.mail.bulk([this.message()!.id], 'restore').subscribe(() => {
      this.toast.success('Message restauré');
      this.back();
    });
  }

  print(): void {
    window.print();
  }
}
