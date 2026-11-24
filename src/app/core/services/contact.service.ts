import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { EMPTY, expand, Observable, reduce } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ContactExistsResponse, ContactPayload, Page, User } from '../models';

/** Garde-fou : nombre maximal de pages lues pour charger tout l'annuaire personnel */
const MAX_PAGES = 50;

/**
 * Annuaire personnel : les utilisateurs de la plateforme que l'on a ajoutés à son carnet.
 * Carnet privé — `userId` est toujours l'utilisateur connecté.
 */
@Injectable({ providedIn: 'root' })
export class ContactService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/users`;

// const PAGE_SIZE = 100;
  /** GET /users/{userId}/contacts?q=&page=&pageSize= */
  list(userId: number, q = '', page = 1, pageSize = 100): Observable<Page<User>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (q.trim()) params = params.set('q', q.trim());
    return this.http.get<Page<User>>(`${this.api}/${userId}/contacts`, { params });
  }

  /** Tout le carnet : enchaîne les pages */
  all(userId: number): Observable<User[]> {
    return this.list(userId, '', 1).pipe(
      expand((p) => (p.items.length && p.page < MAX_PAGES && p.page * p.pageSize < p.total ? this.list(userId, '', p.page + 1) : EMPTY)),
      reduce((acc, p) => acc.concat(p.items), [] as User[]),
    );
  }

  /** POST /users/{userId}/contacts — { "contactUserId": 8 } (409 si déjà présent) */
  add(userId: number, contactUserId: number): Observable<unknown> {
    const body: ContactPayload = { contactUserId };
    return this.http.post<unknown>(`${this.api}/${userId}/contacts`, body);
  }

  /** GET /users/{userId}/contacts/{contactUserId}/exists — { "exists": true|false } */
  exists(userId: number, contactUserId: number): Observable<ContactExistsResponse> {
    return this.http.get<ContactExistsResponse>(`${this.api}/${userId}/contacts/${contactUserId}/exists`);
  }

  /** DELETE /users/{userId}/contacts/{id} — `id` = identifiant de l'utilisateur retiré du carnet */
  remove(userId: number, contactId: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/${userId}/contacts/${contactId}`);
  }
}
