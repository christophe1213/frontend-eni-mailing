import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminStats, AuditLog, Page } from '../models';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/admin`;

  stats(): Observable<AdminStats> {
    return this.http.get<AdminStats>(`${this.api}/stats`);
  }

  logs(query: { q?: string; action?: string; page?: number }): Observable<Page<AuditLog>> {
    let params = new HttpParams().set('page', query.page ?? 1);
    if (query.q) params = params.set('q', query.q);
    if (query.action) params = params.set('action', query.action);
    return this.http.get<Page<AuditLog>>(`${this.api}/logs`, { params });
  }
}
