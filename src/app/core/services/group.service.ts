import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { GroupPayload, MailGroup } from '../models';

@Injectable({ providedIn: 'root' })
export class GroupService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/groups`;

  list(q = ''): Observable<MailGroup[]> {
    return this.http.get<MailGroup[]>(this.api, { params: q ? new HttpParams().set('q', q) : undefined });
  }

  get(id: number): Observable<MailGroup> {
    return this.http.get<MailGroup>(`${this.api}/${id}`);
  }

  create(payload: GroupPayload): Observable<MailGroup> {
    return this.http.post<MailGroup>(this.api, payload);
  }

  update(id: number, payload: GroupPayload): Observable<MailGroup> {
    return this.http.put<MailGroup>(`${this.api}/${id}`, payload);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/${id}`);
  }
}
