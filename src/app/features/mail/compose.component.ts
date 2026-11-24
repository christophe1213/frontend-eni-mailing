import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { Attachment, ComposePayload, fullName, MailDetail, MailGroup, MailTemplate, Priority, UserSummary } from '../../core/models';
import { errorMessage } from '../../core/interceptors/http.interceptors';
import { AuthService } from '../../core/services/auth.service';
import { ContactService } from '../../core/services/contact.service';
import { GroupService } from '../../core/services/group.service';
import { MailService } from '../../core/services/mail.service';
import { fillTemplate, TemplateService, templateVariables } from '../../core/services/template.service';
import { ToastService } from '../../core/services/toast.service';
import { UserService } from '../../core/services/user.service';
import { FileSizePipe } from '../../shared/pipes';
import { groupChip, RecipientChip, RecipientInputComponent, userChip } from '../../shared/recipient-input.component';
import { IconComponent } from '../../shared/icon.component';

const MAX_FILE = 10 * 1024 * 1024;   // RG09
const MAX_TOTAL = 25 * 1024 * 1024;
const FORBIDDEN = /\.(exe|bat|cmd|js|vbs)$/i;

@Component({
  selector: 'app-compose',
  imports: [IconComponent, FormsModule, RecipientInputComponent, FileSizePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './compose.component.html',
  styleUrl: './compose.component.scss',
})
export class ComposeComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private mail = inject(MailService);
  private users = inject(UserService);
  private groupsApi = inject(GroupService);
  private contactsApi = inject(ContactService);
  private templatesApi = inject(TemplateService);
  private toast = inject(ToastService);
  readonly auth = inject(AuthService);

  readonly allUsers = signal<UserSummary[]>([]);
  readonly allGroups = signal<MailGroup[]>([]);
  readonly templates = signal<MailTemplate[]>([]);
  readonly contacts = signal<UserSummary[]>([]);
  /** Membres de l'annuaire personnel (comptes actifs), proposés en premier dans l'autocomplétion */
  readonly contactChips = computed<RecipientChip[]>(() => {
    const active = new Set(this.allUsers().map((u) => u.id));
    return this.contacts().filter((u) => active.has(u.id)).map((u) => ({ ...userChip(u), contact: true }));
  });

  readonly to = signal<RecipientChip[]>([]);
  readonly cc = signal<RecipientChip[]>([]);
  readonly bcc = signal<RecipientChip[]>([]);
  readonly showCc = signal(false);
  subject = '';
  body = '';
  /** Message d'origine cité lors d'une réponse : affiché en lecture seule, ajouté au corps à l'envoi */
  readonly quoted = signal('');
  priority: Priority = 'NORMALE';
  isAnnouncement = false;
  readonly attachments = signal<Attachment[]>([]);
  readonly uploading = signal(0);

  readonly draftId = signal<number | null>(null);
  readonly parentId = signal<number | null>(null);
  readonly sending = signal(false);
  readonly error = signal('');
  readonly mode = signal<'new' | 'reply' | 'forward' | 'draft'>('new');

  // Modèle sélectionné en attente de remplissage des variables
  readonly pendingTemplate = signal<MailTemplate | null>(null);
  readonly varExample = '{{variable}}';
  templateValues: Record<string, string> = {};
  readonly templateVars = computed(() => (this.pendingTemplate() ? templateVariables(this.pendingTemplate()!) : []));

  readonly canAnnounce = computed(() => this.auth.hasRole('PERSONNEL'));
  /** RG08 : un étudiant ne peut écrire qu'aux listes ouvertes aux étudiants */
  readonly writableGroups = computed(() =>
    this.auth.user()?.role === 'ETUDIANT' ? this.allGroups().filter((g) => g.openToStudents) : this.allGroups());
  readonly totalSize = computed(() => this.attachments().reduce((s, a) => s + a.size, 0));
  /** Estimation du nombre de destinataires (utilisateurs + membres des listes) */
  readonly recipientCount = computed(() =>
    [...this.to(), ...this.cc(), ...this.bcc()].reduce(
      (n, c) => n + (c.kind === 'user' ? 1 : (this.allGroups().find((g) => g.id === c.id)?.memberCount ?? 0)), 0));
  readonly title = computed(() => ({ new: 'Nouveau message', reply: 'Répondre', forward: 'Transférer', draft: 'Brouillon' })[this.mode()]);

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    const meId = this.auth.user()?.id;
    forkJoin({
      users: this.users.list({ active: true, pageSize: 1000 }),
      groups: this.groupsApi.list(),
      templates: this.canAnnounce() ? this.templatesApi.list() : of([] as MailTemplate[]),
      // Le carnet est facultatif : son échec ne doit pas bloquer la composition
      contacts: meId ? this.contactsApi.all(meId).pipe(catchError(() => of([] as UserSummary[]))) : of([] as UserSummary[]),
    }).subscribe(({ users, groups, templates, contacts }) => {
      const me = this.auth.user()?.id;
      this.allUsers.set(users.items.filter((u) => u.id !== me));
      this.allGroups.set(groups);
      this.templates.set(templates);
      this.contacts.set(contacts);

      const toUser = Number(qp.get('to'));
      if (toUser) { const u = users.items.find((x) => x.id === toUser); if (u) this.to.set([userChip(u)]); }
      const toGroup = Number(qp.get('group'));
      if (toGroup) { const g = groups.find((x) => x.id === toGroup); if (g) this.to.set([groupChip(g)]); }
      const tpl = Number(qp.get('template'));
      if (tpl) { const t = templates.find((x) => x.id === tpl); if (t) this.useTemplate(t); }
    });

    const replyTo = Number(qp.get('replyTo'));
    const forward = Number(qp.get('forward'));
    const draft = Number(qp.get('draft'));
    if (replyTo) this.mail.get(replyTo).subscribe((m) => this.initReply(m, qp.get('all') === '1'));
    else if (forward) this.mail.get(forward).subscribe((m) => this.initForward(m));
    else if (draft) this.mail.get(draft).subscribe((m) => this.initDraft(m));
    else this.body = this.signature();
  }

  private signature(): string {
    const s = this.auth.user()?.signature;
    return s ? `\n\n--\n${s}` : '';
  }

  private quote(m: MailDetail): string {
    const date = new Date(m.date).toLocaleString('fr-FR');
    return `Le ${date}, ${fullName(m.from)} a écrit :\n` + m.body.split('\n').map((l) => ` ${l}`).join('\n');
  }

  private initReply(m: MailDetail, all: boolean): void {
    const me = this.auth.user()!.id;
    this.mode.set('reply');
    this.parentId.set(m.id);
    this.subject = /^re\s*:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`;
    const to = [m.from, ...(all ? m.recipients.filter((r) => r.type === 'TO').map((r) => r.user) : [])].filter((u) => u.id !== me);
    // L'expéditeur d'origine est verrouillé : on répond à lui, il ne doit pas pouvoir être retiré du champ « À »
    this.to.set(dedupe(to).map((u) => (u.id === m.from.id ? { ...userChip(u), locked: true } : userChip(u))));
    if (all) {
      const cc = m.recipients.filter((r) => r.type === 'CC' && r.user.id !== me).map((r) => r.user);
      if (cc.length) { this.cc.set(cc.map(userChip)); this.showCc.set(true); }
    }
    // Seule la zone de saisie (signature) est éditable ; le message cité est affiché à part, en lecture seule
    this.body = this.signature();
    this.quoted.set(this.quote(m));
  }

  private initForward(m: MailDetail): void {
    this.mode.set('forward');
    this.parentId.set(m.id);
    this.subject = /^tr\s*:/i.test(m.subject) ? m.subject : `Tr: ${m.subject}`;
    this.attachments.set(m.attachments);
    this.body = `${this.signature()}\n\n---------- Message transféré ----------\nDe : ${fullName(m.from)} <${m.from.email}>\n` +
      `Date : ${new Date(m.date).toLocaleString('fr-FR')}\nObjet : ${m.subject}\n\n${m.body}`;
  }

  private initDraft(m: MailDetail): void {
    this.mode.set('draft');
    this.draftId.set(m.id);
    this.subject = m.subject;
    this.body = m.body;
    this.priority = m.priority;
    this.isAnnouncement = m.isAnnouncement;
    this.attachments.set(m.attachments);
    this.parentId.set(m.parentId ?? null);
    this.to.set([...m.recipients.filter((r) => r.type === 'TO').map((r) => userChip(r.user)),
      ...m.groups.map((g) => ({ kind: 'group' as const, id: g.id, label: g.name, sub: '' }))]);
    this.cc.set(m.recipients.filter((r) => r.type === 'CC').map((r) => userChip(r.user)));
    this.bcc.set(m.recipients.filter((r) => r.type === 'BCC').map((r) => userChip(r.user)));
    if (this.cc().length || this.bcc().length) this.showCc.set(true);
  }

  // ----- Modèles -----
  useTemplate(t: MailTemplate): void {
    this.templateValues = {};
    if (templateVariables(t).length) this.pendingTemplate.set(t);
    else this.applyTemplate(t);
  }

  applyTemplate(t = this.pendingTemplate()!): void {
    this.subject = fillTemplate(t.subject, this.templateValues);
    this.body = fillTemplate(t.body, this.templateValues) + this.signature();
    this.isAnnouncement = true;
    this.priority = 'HAUTE';
    this.pendingTemplate.set(null);
  }

  onTemplateSelect(sel: HTMLSelectElement): void {
    const t = this.templates().find((x) => x.id === Number(sel.value));
    sel.value = '';
    if (t) this.useTemplate(t);
  }

  // ----- Pièces jointes -----
  addFiles(input: HTMLInputElement): void {
    const files = Array.from(input.files ?? []);
    input.value = '';
    let total = this.totalSize();
    for (const f of files) {
      if (FORBIDDEN.test(f.name)) { this.toast.error(`« ${f.name} » : type de fichier interdit.`); continue; }
      if (f.size > MAX_FILE) { this.toast.error(`« ${f.name} » dépasse 10 Mo.`); continue; }
      if (total + f.size > MAX_TOTAL) { this.toast.error('Taille totale des pièces jointes limitée à 25 Mo.'); break; }
      total += f.size;
      this.uploading.update((n) => n + 1);
      this.mail.upload(f).subscribe({
        next: (a) => { this.attachments.update((l) => [...l, a]); this.uploading.update((n) => n - 1); },
        error: (e) => { this.toast.error(errorMessage(e)); this.uploading.update((n) => n - 1); },
      });
    }
  }

  removeAttachment(a: Attachment): void {
    this.attachments.update((l) => l.filter((x) => x.id !== a.id));
  }

  // ----- Envoi -----
  private payload(draft: boolean): ComposePayload {
    const users = (l: RecipientChip[]) => l.filter((c) => c.kind === 'user').map((c) => c.id);
    const groupIds = [...this.to(), ...this.cc(), ...this.bcc()].filter((c) => c.kind === 'group').map((c) => c.id);
    return {
      subject: this.subject.trim(), body: this.fullBody(), priority: this.priority,
      to: users(this.to()), cc: users(this.cc()), bcc: users(this.bcc()), groupIds: [...new Set(groupIds)],
      attachmentIds: this.attachments().map((a) => a.id), parentId: this.parentId(),
      isAnnouncement: this.canAnnounce() && this.isAnnouncement, draft,
    };
  }

  /** Corps envoyé : texte saisi + message cité (réponse) */
  private fullBody(): string {
    const q = this.quoted();
    return q ? `${this.body.trimEnd()}\n\n${q}` : this.body;
  }

  send(): void {
    this.error.set('');
    if (!this.to().length && !this.cc().length && !this.bcc().length) { this.error.set('Ajoutez au moins un destinataire.'); return; }
    if (!this.subject.trim()) { this.error.set("L'objet du message est obligatoire."); return; }
    const n = this.recipientCount();
    if (n > 50 && !confirm(`Ce message sera diffusé à environ ${n} personnes. Confirmer l'envoi ?`)) return;
    this.submit(false);
  }

  saveDraft(): void {
    this.submit(true);
  }

  private submit(draft: boolean): void {
    this.sending.set(true);
    this.mail.send(this.payload(draft), this.draftId()).subscribe({
      next: (m) => {
        this.sending.set(false);
        if (draft) {
          this.draftId.set(m.id);
          this.toast.success('Brouillon enregistré');
        } else {
          this.toast.success('Message envoyé');
          this.router.navigate(['/mail/sent']);
        }
      },
      error: (e) => { this.error.set(errorMessage(e)); this.sending.set(false); },
    });
  }

  discard(): void {
    const id = this.draftId();
    const dirty = this.subject || this.body.trim() !== this.signature().trim() || this.to().length;
    if (dirty && !id && !confirm('Abandonner ce message ?')) return;
    if (id && confirm('Supprimer ce brouillon ?')) {
      this.mail.delete(id).subscribe(() => this.router.navigate(['/mail/drafts']));
      return;
    }
    history.length > 1 ? history.back() : this.router.navigate(['/mail/inbox']);
  }
}

function dedupe(list: UserSummary[]): UserSummary[] {
  const seen = new Set<number>();
  return list.filter((u) => !seen.has(u.id) && !!seen.add(u.id));
}
