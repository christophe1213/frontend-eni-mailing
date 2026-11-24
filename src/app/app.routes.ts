import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/guards/auth.guards';
import { ShellComponent } from './layout/shell.component';

export const routes: Routes = [
  // ----- Pages publiques -----
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Connexion — ENI Mail',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    title: 'Créer un compte — ENI Mail',
    loadComponent: () => import('./features/auth/register-role.component').then((m) => m.RegisterRoleComponent),
  },
  {
    path: 'register/:role',
    canActivate: [guestGuard],
    title: 'Créer votre compte — ENI Mail',
    loadComponent: () => import('./features/auth/register-form.component').then((m) => m.RegisterFormComponent),
  },
  {
    path: 'verify-email',
    canActivate: [guestGuard],
    title: "Vérification de l'e-mail — ENI Mail",
    loadComponent: () => import('./features/auth/verify-email.component').then((m) => m.VerifyEmailComponent),
  },
  {
    path: 'forgot-password',
    canActivate: [guestGuard],
    title: 'Mot de passe oublié — ENI Mail',
    loadComponent: () => import('./features/auth/forgot-password.component').then((m) => m.ForgotPasswordComponent),
  },

  // ----- Application (shell avec barre latérale) -----
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'mail/inbox' },
      { path: 'mail', pathMatch: 'full', redirectTo: 'mail/inbox' },
      {
        path: 'mail/:folder',
        title: 'Messages — ENI Mail',
        loadComponent: () => import('./features/mail/mail-list.component').then((m) => m.MailListComponent),
      },
      {
        path: 'mail/:folder/:id',
        title: 'Message — ENI Mail',
        loadComponent: () => import('./features/mail/mail-detail.component').then((m) => m.MailDetailComponent),
      },
      {
        path: 'compose',
        title: 'Nouveau message — ENI Mail',
        loadComponent: () => import('./features/mail/compose.component').then((m) => m.ComposeComponent),
      },
      {
        path: 'directory',
        title: 'Annuaire — ENI Mail',
        loadComponent: () => import('./features/directory/directory.component').then((m) => m.DirectoryComponent),
      },
      {
        path: 'groups',
        title: 'Listes de diffusion — ENI Mail',
        loadComponent: () => import('./features/groups/group-list.component').then((m) => m.GroupListComponent),
      },
      {
        path: 'groups/new',
        canActivate: [roleGuard('ENSEIGNANT')],
        title: 'Nouvelle liste — ENI Mail',
        loadComponent: () => import('./features/groups/group-detail.component').then((m) => m.GroupDetailComponent),
      },
      {
        path: 'groups/:id',
        title: 'Liste de diffusion — ENI Mail',
        loadComponent: () => import('./features/groups/group-detail.component').then((m) => m.GroupDetailComponent),
      },
      {
        path: 'templates',
        canActivate: [roleGuard('PERSONNEL')],
        title: "Modèles d'annonces — ENI Mail",
        loadComponent: () => import('./features/templates/templates.component').then((m) => m.TemplatesComponent),
      },
      {
        path: 'profile',
        title: 'Mon profil — ENI Mail',
        loadComponent: () => import('./features/profile/profile.component').then((m) => m.ProfileComponent),
      },
      {
        path: 'admin',
        canActivate: [roleGuard('ADMIN')],
        children: [
          {
            path: '',
            title: 'Administration — ENI Mail',
            loadComponent: () => import('./features/admin/admin-dashboard.component').then((m) => m.AdminDashboardComponent),
          },
          {
            path: 'users',
            title: 'Utilisateurs — ENI Mail',
            loadComponent: () => import('./features/admin/admin-users.component').then((m) => m.AdminUsersComponent),
          },
          {
            path: 'logs',
            title: "Journal d'audit — ENI Mail",
            loadComponent: () => import('./features/admin/admin-logs.component').then((m) => m.AdminLogsComponent),
          },
        ],
      },
      {
        path: '**',
        title: 'Page introuvable — ENI Mail',
        loadComponent: () => import('./features/not-found/not-found.component').then((m) => m.NotFoundComponent),
      },
    ],
  },
];
