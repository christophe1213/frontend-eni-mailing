import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Page, User, UserPayload } from '../models';

export interface UserQuery {
  q?: string;
  role?: string;
  level?: string;
  track?: string;
  active?: boolean | '' | 'pending';
  page?: number;
  pageSize?: number;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/users`;

  list(query: UserQuery = {}): Observable<Page<User>> {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
    }
    return this.http.get<Page<User>>(this.api, { params });
  }

  get(id: number): Observable<User> {
    return this.http.get<User>(`${this.api}/${id}`);
  }

  create(payload: UserPayload): Observable<User> {
    return this.http.post<User>(this.api, payload);
  }

  update(id: number, payload: UserPayload): Observable<User> {
    return this.http.put<User>(`${this.api}/${id}`, payload);
  }

  setActive(id: number, active: boolean): Observable<User> {
    return this.http.patch<User>(`${this.api}/${id}/active`, { active });
  }

  resetPassword(id: number): Observable<void> {
    return this.http.post<void>(`${this.api}/${id}/reset-password`, {});
  }
}
