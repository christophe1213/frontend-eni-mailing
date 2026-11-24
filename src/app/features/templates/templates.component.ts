import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MailGroup, MailTemplate, Priority, TemplatePayload } from '../../core/models';
import { errorMessage } from '../../core/interceptors/http.interceptors';
import { AuthService } from '../../core/services/auth.service';
import { GroupService } from '../../core/services/group.service';
import { MailService } from '../../core/services/mail.service';
import { fillTemplate, TemplateService, templateVariables } from '../../core/services/template.service';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent, IconName } from '../../shared/icon.component';

type Step = 1 | 2 | 3;
type Tone = 'sky' | 'teal' | 'amber' | 'violet';

/** Icône et teinte de la pastille selon la catégorie du modèle */
const CATEGORY_STYLE: Record<string, { icon: IconName; tone: Tone }> = {
  examens: { icon: 'file-text', tone: 'sky' },
  réunions: { icon: 'users', tone: 'teal' },
  administratif: { icon: 'bell', tone: 'amber' },
  informations: { icon: 'info', tone: 'violet' },
};

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Choisir un modèle' },
  { n: 2, label: 'Personnaliser' },
  { n: 3, label: 'Destinataires' },
];

/** Diffusion d'une annonce à partir d'un modèle, en 3 étapes (UC10) */
@Component({
  selector: 'app-templates',
  imports: [IconComponent, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './templates.component.html',
  styleUrl: './templates.component.scss',
})
export class TemplatesComponent implements OnInit {
  private api = inject(TemplateService);
  private groupsApi = inject(GroupService);
  private mail = inject(MailService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private auth = inject(AuthService);

  readonly steps = STEPS;
  readonly step = signal<Step>(1);

  // ----- Étape 1 : choix du modèle -----
  readonly templates = signal<MailTemplate[]>([]);
  readonly loading = signal(true);
  readonly q = signal('');
  readonly category = signal('');
  readonly categories = computed(() => [...new Set(this.templates().map((t) => t.category))].sort());
  readonly filtered = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.templates().filter((t) => (!this.category() || t.category === this.category())
      && (!q || `${t.title} ${t.subject} ${t.category}`.toLowerCase().includes(q)));
  });
  readonly selected = signal<MailTemplate | null>(null);

  // ----- Étape 2 : personnalisation -----
  values: Record<string, string> = {};
  subject = '';
  body = '';
  priority: Priority = 'HAUTE';
  /** Incrémenté à chaque saisie pour recalculer l'aperçu */
  readonly edits = signal(0);
  readonly variables = computed(() => (this.selected() ? templateVariables(this.selected()!) : []));
  readonly preview = computed(() => {
    this.edits();
    return { subject: fillTemplate(this.subject, this.values), body: fillTemplate(this.body, this.values) };
  });
  readonly missing = computed(() => {
    this.edits();
    return this.variables().filter((v) => !this.values[v]?.trim());
  });

  // ----- Étape 3 : destinataires -----
  readonly groups = signal<MailGroup[]>([]);
  readonly targets = signal<Set<number>>(new Set());
  readonly chosen = computed(() => this.groups().filter((g) => this.targets().has(g.id)));
  readonly recipientCount = computed(() => this.chosen().reduce((n, g) => n + g.memberCount, 0));
  readonly sending = signal(false);

  // ----- Création / édition de modèle -----
  /** undefined = fermé, null = création, nombre = édition */
  readonly editingId = signal<number | null | undefined>(undefined);
  readonly formError = signal('');
  form: TemplatePayload = { title: '', category: '', subject: '', body: '' };
  readonly vars = templateVariables;
  readonly varExample = '{{date}}';

  ngOnInit(): void {
    this.load();
    this.groupsApi.list().subscribe((g) => this.groups.set(g));
  }

  private load(): void {
    this.api.list().subscribe((t) => { this.templates.set(t); this.loading.set(false); });
  }

  styleOf(category: string): { icon: IconName; tone: Tone } {
    return CATEGORY_STYLE[category.toLowerCase()] ?? { icon: 'megaphone', tone: 'sky' };
  }

  /** Pastille courte d'une liste : niveau (L3) ou initiales */
  groupCode(g: MailGroup): string {
    return g.criteriaLevel ?? g.name.split(/[\s–-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  }

  groupTone(g: MailGroup): Tone {
    const tones: Tone[] = ['sky', 'teal', 'amber', 'violet'];
    return tones[g.id % tones.length];
  }

  goTo(n: Step): void {
    // On ne peut revenir qu'aux étapes déjà franchies
    if (n < this.step()) this.step.set(n);
  }

  // ----- Navigation entre étapes -----
  use(t: MailTemplate): void {
    this.selected.set(t);
    this.values = {};
    this.subject = t.subject;
    this.body = t.body + (this.auth.user()?.signature ? `\n\n--\n${this.auth.user()!.signature}` : '');
    this.priority = 'HAUTE';
    this.touch();
    this.step.set(2);
  }

  touch(): void {
    this.edits.update((n) => n + 1);
  }

  toRecipients(): void {
    if (!this.preview().subject.trim()) {
      this.toast.error("L'objet de l'annonce est obligatoire.");
      return;
    }
    if (this.missing().length && !confirm(`Variables non renseignées : ${this.missing().join(', ')}. Continuer quand même ?`)) return;
    this.step.set(3);
  }

  toggleTarget(id: number): void {
    const s = new Set(this.targets());
    s.has(id) ? s.delete(id) : s.add(id);
    this.targets.set(s);
  }

  send(): void {
    const ids = [...this.targets()];
    if (!ids.length) {
      this.toast.error('Sélectionnez au moins une liste de diffusion.');
      return;
    }
    if (!confirm(`Envoyer l'annonce à environ ${this.recipientCount()} destinataire(s) ?`)) return;
    const { subject, body } = this.preview();
    this.sending.set(true);
    this.mail.send({
      subject, body, priority: this.priority, to: [], cc: [], bcc: [], groupIds: ids,
      attachmentIds: [], parentId: null, isAnnouncement: true, draft: false,
    }).subscribe({
      next: () => {
        this.sending.set(false);
        this.toast.success('Annonce diffusée');
        this.router.navigate(['/mail/sent']);
      },
      error: (e) => { this.sending.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  /** Ouvre l'éditeur classique avec le modèle pré-rempli (pièces jointes, destinataires individuels…) */
  openInComposer(): void {
    this.router.navigate(['/compose'], { queryParams: { template: this.selected()!.id } });
  }

  // ----- CRUD des modèles -----
  edit(t: MailTemplate | null): void {
    this.formError.set('');
    this.form = t ? { title: t.title, category: t.category, subject: t.subject, body: t.body } : { title: '', category: '', subject: '', body: '' };
    this.editingId.set(t ? t.id : null);
  }

  save(): void {
    if (!this.form.title || !this.form.category || !this.form.subject || !this.form.body) {
      this.formError.set('Tous les champs sont obligatoires.');
      return;
    }
    const id = this.editingId();
    (id ? this.api.update(id, this.form) : this.api.create(this.form)).subscribe({
      next: () => { this.toast.success('Modèle enregistré'); this.editingId.set(undefined); this.load(); },
      error: (e) => this.formError.set(errorMessage(e)),
    });
  }

  remove(): void {
    const id = this.editingId();
    if (!id || !confirm(`Supprimer le modèle « ${this.form.title} » ?`)) return;
    this.api.delete(id).subscribe(() => { this.toast.success('Modèle supprimé'); this.editingId.set(undefined); this.load(); });
  }
}
