import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import localeFr from '@angular/common/locales/fr';
import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { authInterceptor, errorInterceptor } from './core/interceptors/http.interceptors';
import { mockBackendInterceptor } from './core/mock/mock-backend.interceptor';

registerLocaleData(localeFr);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    // L'intercepteur simulé doit être le dernier : il reçoit la requête déjà authentifiée
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor, mockBackendInterceptor])),
    { provide: LOCALE_ID, useValue: 'fr-FR' },
  ],
};
