import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { GroupPayload, LEVELS, MailGroup, Role, ROLE_LABELS, Track, TRACK_LABELS, User, UserSummary } from '../../core/models';
import { errorMessage } from '../../core/interceptors/http.interceptors';
import { AuthService } from '../../core/services/auth.service';
import { GroupService } from '../../core/services/group.service';
import { ToastService } from '../../core/services/toast.service';
import { UserService } from '../../core/services/user.service';
import { AvatarComponent } from '../../shared/avatar.component';
import { FullNamePipe, RoleLabelPipe } from '../../shared/pipes';
import { IconComponent } from '../../shared/icon.component';

const EMPTY: GroupPayload = {
  name: '', address: '', description: '', type: 'MANUELLE',
  criteriaRole: null, criteriaLevel: null, criteriaTrack: null, openToStudents: true, memberIds: [],
};

@Component({
  selector: 'app-group-detail',
  imports: [IconComponent, FormsModule, RouterLink, AvatarComponent, FullNamePipe, RoleLabelPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './group-detail.component.html',
  styleUrl: './group-detail.component.scss',
})
export class GroupDetailComponent implements OnInit {
  private groups = inject(GroupService);
  private users = inject(UserService);
  private router = inject(Router);
  private toast = inject(ToastService);
  readonly auth = inject(AuthService);

  /** Identifiant (paramètre de route) ; absent sur /groups/new */
  readonly id = input<string | undefined>();

  readonly roles = Object.keys(ROLE_LABELS) as Role[];
  readonly roleLabels = ROLE_LABELS;
  readonly levels = LEVELS;
  readonly tracks = Object.keys(TRACK_LABELS) as Track[];
  readonly trackLabels = TRACK_LABELS;
  readonly domain = environment.mailDomain;

  readonly group = signal<MailGroup | null>(null);
  readonly editing = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly allUsers = signal<User[]>([]);
  readonly memberFilter = signal('');
  form: GroupPayload = { ...EMPTY };
  readonly memberIds = signal<Set<number>>(new Set());

  readonly isNew = computed(() => !this.id());
  readonly canEdit = computed(() => {
    const g = this.group(), me = this.auth.user();
    return !!g && !!me && (g.owner.id === me.id || me.role === 'ADMIN');
  });
  readonly canCreateAuto = computed(() => this.auth.hasRole('PERSONNEL'));
  readonly candidates = computed(() => {
    const q = this.memberFilter().toLowerCase();
    return this.allUsers().filter((u) => !q || `${u.firstName} ${u.lastName} ${u.email} ${u.level ?? ''}`.toLowerCase().includes(q));
  });

  ngOnInit(): void {
    this.users.list({ active: true, pageSize: 1000 }).subscribe((p) => this.allUsers.set(p.items));
    if (this.isNew()) {
      this.startEdit();
    } else {
      this.load();
    }
  }

  private load(): void {
    this.groups.get(Number(this.id())).subscribe({
      next: (g) => this.group.set(g),
      error: (e) => this.error.set(errorMessage(e)),
    });
  }

  criteria(g: MailGroup): string {
    return [g.criteriaRole && ROLE_LABELS[g.criteriaRole], g.criteriaLevel, g.criteriaTrack && TRACK_LABELS[g.criteriaTrack]]
      .filter(Boolean).join(' · ') || 'Tous les utilisateurs actifs';
  }

  startEdit(): void {
    const g = this.group();
    this.form = g
      ? { name: g.name, address: g.address, description: g.description, type: g.type, criteriaRole: g.criteriaRole ?? null,
          criteriaLevel: g.criteriaLevel ?? null, criteriaTrack: g.criteriaTrack ?? null, openToStudents: g.openToStudents,
          memberIds: (g.members ?? []).map((m) => m.id) }
      : { ...EMPTY, memberIds: [this.auth.user()!.id] };
    this.memberIds.set(new Set(this.form.memberIds));
    this.editing.set(true);
  }

  cancel(): void {
    if (this.isNew()) this.router.navigate(['/groups']);
    else this.editing.set(false);
  }

  /** Propose une adresse à partir du nom : « Club Robotique » → club-robotique@eni.mg */
  suggestAddress(): void {
    if (this.form.address) return;
    const slug = this.form.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (slug) this.form.address = `${slug}@${this.domain}`;
  }

  toggleMember(u: UserSummary): void {
    const s = new Set(this.memberIds());
    s.has(u.id) ? s.delete(u.id) : s.add(u.id);
    this.memberIds.set(s);
  }

  save(): void {
    this.error.set('');
    if (!this.form.name.trim() || !this.form.address.trim()) {
      this.error.set('Le nom et l\'adresse sont obligatoires.');
      return;
    }
    const payload: GroupPayload = { ...this.form, memberIds: [...this.memberIds()] };
    this.saving.set(true);
    const req = this.isNew() ? this.groups.create(payload) : this.groups.update(Number(this.id()), payload);
    req.subscribe({
      next: (g) => {
        this.saving.set(false);
        this.toast.success(this.isNew() ? 'Liste créée' : 'Liste mise à jour');
        this.group.set(g);
        this.editing.set(false);
        if (this.isNew()) this.router.navigate(['/groups', g.id], { replaceUrl: true });
      },
      error: (e) => { this.error.set(errorMessage(e)); this.saving.set(false); },
    });
  }

  remove(): void {
    const g = this.group()!;
    if (!confirm(`Supprimer la liste « ${g.name} » ? Les messages déjà envoyés sont conservés.`)) return;
    this.groups.delete(g.id).subscribe({
      next: () => { this.toast.success('Liste supprimée'); this.router.navigate(['/groups']); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }
}
