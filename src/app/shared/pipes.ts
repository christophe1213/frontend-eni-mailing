import { Pipe, PipeTransform } from '@angular/core';
import { fullName, Role, ROLE_LABELS, User } from '../core/models';
import { formatPhone } from './phone';

/** Date courte façon messagerie : « 09:12 », « Hier », « 28 oct. », « 12/03/2025 » */
@Pipe({ name: 'mailDate' })
export class MailDatePipe implements PipeTransform {
  transform(value: string | null | undefined, long = false): string {
    if (!value) return '';
    const d = new Date(value);
    if (long) {
      return d.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    const now = new Date();
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === yesterday.toDateString()) return 'Hier';
    if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    return d.toLocaleDateString('fr-FR');
  }
}

@Pipe({ name: 'fileSize' })
export class FileSizePipe implements PipeTransform {
  transform(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
    return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
  }
}

@Pipe({ name: 'fullName' })
export class FullNamePipe implements PipeTransform {
  transform(u: Pick<User, 'firstName' | 'lastName'> | null | undefined): string {
    return fullName(u);
  }
}

@Pipe({ name: 'roleLabel' })
export class RoleLabelPipe implements PipeTransform {
  transform(role: Role | null | undefined): string {
    return role ? ROLE_LABELS[role] : '';
  }
}

/** « +261341234567 » → « 034 12 345 67 » */
@Pipe({ name: 'phone' })
export class PhonePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return formatPhone(value);
  }
}
