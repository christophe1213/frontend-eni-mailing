import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import { TRACK_LABELS } from '../../core/models';
import { errorMessage } from '../../core/interceptors/http.interceptors';
import { resetMockDb } from '../../core/mock/mock-backend.interceptor';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { AvatarComponent } from '../../shared/avatar.component';
import { resizeToSquare } from '../../shared/image-resize';
import { PhoneInputComponent } from '../../shared/phone-input.component';
import { phoneIssue } from '../../shared/phone';
import { FullNamePipe, MailDatePipe, RoleLabelPipe } from '../../shared/pipes';

const MAX_PHOTO = 5 * 1024 * 1024;

@Component({
  selector: 'app-profile',
  imports: [FormsModule, AvatarComponent, FullNamePipe, RoleLabelPipe, MailDatePipe, PhoneInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let u = auth.user()!;
    <div class="page narrow">
      <div class="page-header"><h1>Mon profil</h1></div>

      <section class="card card-body identity">
        <div class="avatar-box">
          <app-avatar [user]="u" [size]="76" />
          <div class="avatar-actions">
            <label class="btn sm" [class.disabled]="avatarBusy()">
              {{ avatarBusy() ? 'Envoi…' : 'Changer la photo' }}
              <input type="file" hidden #photoInput accept="image/jpeg,image/png,image/webp" [disabled]="avatarBusy()" (change)="onPhotoSelected(photoInput)" />
            </label>
            @if (u.avatarUrl) { <button type="button" class="btn sm ghost" [disabled]="avatarBusy()" (click)="removePhoto()">Supprimer</button> }
          </div>
        </div>
        <div>
          <h2>{{ u | fullName }}</h2>
          <p class="muted">{{ u.email }}</p>
          <div class="tags">
            <span class="badge primary">{{ u.role | roleLabel }}</span>
            <span class="badge">{{ u.matricule }}</span>
            @if (u.level) { <span class="badge">{{ u.level }}</span> }
            @if (u.track) { <span class="badge">{{ trackLabels[u.track] }}</span> }
            @if (u.position) { <span class="badge">{{ u.position }}</span> }
          </div>
          <p class="muted small">Membre depuis le {{ u.createdAt | mailDate }} · Les informations d'identité sont gérées par l'administration.</p>
        </div>
      </section>

      <form class="card card-body" (ngSubmit)="saveProfile()">
        <h2>Préférences</h2>
        <div class="field">
          <label for="phone">Téléphone</label>
          <app-phone-input inputId="phone" name="phone" [(ngModel)]="phone" />
        </div>
        <div class="field">
          <label for="sig">Signature</label>
          <textarea id="sig" name="signature" class="input" rows="4" [(ngModel)]="signature" placeholder="Ajoutée automatiquement à vos nouveaux messages"></textarea>
        </div>
        <label class="checkbox"><input type="checkbox" name="notif" [(ngModel)]="notifEmail" /> Recevoir une notification pour les annonces officielles</label>
        <div class="actions"><button class="btn primary" [disabled]="saving()">Enregistrer</button></div>
      </form>

      <form class="card card-body" (ngSubmit)="changePassword()">
        <h2>Changer le mot de passe</h2>
        @if (pwdError()) { <div class="alert error">{{ pwdError() }}</div> }
        <div class="form-grid">
          <div class="field full">
            <label for="cur">Mot de passe actuel</label>
            <input id="cur" name="cur" type="password" class="input" [(ngModel)]="current" autocomplete="current-password" />
          </div>
          <div class="field">
            <label for="new">Nouveau mot de passe</label>
            <input id="new" name="new" type="password" class="input" [(ngModel)]="next" autocomplete="new-password" />
            <span class="hint">12 caractères minimum, une majuscule, un chiffre et un symbole.</span>
          </div>
          <div class="field">
            <label for="conf">Confirmation</label>
            <input id="conf" name="conf" type="password" class="input" [(ngModel)]="confirmPwd" autocomplete="new-password" />
          </div>
        </div>
        <div class="actions"><button class="btn primary">Mettre à jour</button></div>
      </form>

      @if (mock) {
        <section class="card card-body">
          <h2>Mode démonstration</h2>
          <p class="muted">Les données sont simulées dans le navigateur. Vous pouvez restaurer le jeu de données initial.</p>
          <div class="actions"><button class="btn danger" type="button" (click)="reset()">Réinitialiser les données</button></div>
        </section>
      }
    </div>
  `,
  styles: `
    .narrow { max-width: 760px; display: flex; flex-direction: column; gap: 16px; }
    .narrow .page-header { margin-bottom: 0; }
    .identity { display: flex; gap: 20px; align-items: center; flex-wrap: wrap;
      p { margin: 4px 0; } .tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0; } }
    .small { font-size: 12px; }
    .avatar-box { display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .avatar-actions { display: flex; flex-direction: column; align-items: center; gap: 4px; }
    label.btn { cursor: pointer; } label.btn.disabled { opacity: .6; pointer-events: none; }
    h2 { margin-bottom: 14px; }
    .actions { display: flex; justify-content: flex-end; margin-top: 14px; }
  `,
})
export class ProfileComponent {
  readonly auth = inject(AuthService);
  private toast = inject(ToastService);
  readonly trackLabels = TRACK_LABELS;
  readonly mock = environment.useMockApi;

  phone = this.auth.user()?.phone ?? '';
  signature = this.auth.user()?.signature ?? '';
  notifEmail = this.auth.user()?.notifEmail ?? true;
  readonly saving = signal(false);
  readonly avatarBusy = signal(false);

  current = '';
  next = '';
  confirmPwd = '';
  readonly pwdError = signal('');

  saveProfile(): void {
    if (phoneIssue(this.phone)) { this.toast.error('Numéro de téléphone invalide : corrigez-le avant d’enregistrer.'); return; }
    this.saving.set(true);
    this.auth.updateMe({ phone: this.phone, signature: this.signature, notifEmail: this.notifEmail }).subscribe({
      next: () => { this.saving.set(false); this.toast.success('Profil mis à jour'); },
      error: (e) => { this.saving.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  async onPhotoSelected(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { this.toast.error('Format non pris en charge (JPEG, PNG ou WebP).'); return; }
    if (file.size > MAX_PHOTO) { this.toast.error('Image trop volumineuse (5 Mo max).'); return; }
    this.avatarBusy.set(true);
    let blob: Blob;
    try { blob = await resizeToSquare(file); }
    catch { this.avatarBusy.set(false); this.toast.error('Impossible de lire cette image.'); return; }
    this.auth.uploadAvatar(blob).subscribe({
      next: () => { this.avatarBusy.set(false); this.toast.success('Photo de profil mise à jour'); },
      error: (e) => { this.avatarBusy.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  removePhoto(): void {
    if (!confirm('Supprimer votre photo de profil ?')) return;
    this.avatarBusy.set(true);
    this.auth.removeAvatar().subscribe({
      next: () => { this.avatarBusy.set(false); this.toast.success('Photo supprimée'); },
      error: (e) => { this.avatarBusy.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  changePassword(): void {
    this.pwdError.set('');
    if (!/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/.test(this.next)) {
      this.pwdError.set('Le mot de passe doit contenir au moins 12 caractères, une majuscule, un chiffre et un symbole.');
      return;
    }
    if (this.next !== this.confirmPwd) { this.pwdError.set('La confirmation ne correspond pas.'); return; }
    this.auth.changePassword(this.current, this.next).subscribe({
      next: () => { this.current = this.next = this.confirmPwd = ''; this.toast.success('Mot de passe modifié'); },
      error: (e) => this.pwdError.set(errorMessage(e)),
    });
  }

  reset(): void {
    if (!confirm('Restaurer les données de démonstration ? Vos modifications seront perdues.')) return;
    resetMockDb();
    this.auth.logout();
  }
}
