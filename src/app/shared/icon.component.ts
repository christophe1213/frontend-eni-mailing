import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  Archive, ArrowLeft, ArrowRight, Ban, Bell, BookOpen, Building2, Check, ChevronLeft, ChevronRight, CircleCheck, Clock,
  Download, Eye, EyeOff, FilePenLine, FileText, Forward, GraduationCap, Inbox, Info, KeyRound, LayoutDashboard, Lock, LogOut,
  LucideAngularModule, LucideIconData, Mail, MailOpen, MailPlus, Megaphone, Menu, Paperclip, PenLine, Pencil, Plus,
  Printer, Reply, ReplyAll, RotateCw, ScrollText, Search, SearchX, Send, Settings2, ShieldCheck, SquarePen, Star,
  Trash2, TriangleAlert, Undo2, Upload, User, UserCog, UserPlus, Users, UsersRound, X,
} from 'lucide-angular';

/** Registre des icônes Lucide utilisées dans l'application */
const ICONS = {
  archive: Archive, 'arrow-left': ArrowLeft, 'arrow-right': ArrowRight, ban: Ban, bell: Bell, book: BookOpen, building: Building2,
  check: Check, 'chevron-left': ChevronLeft, 'chevron-right': ChevronRight, 'circle-check': CircleCheck, clock: Clock,
  compose: SquarePen, draft: FilePenLine, download: Download, edit: Pencil, eye: Eye, 'eye-off': EyeOff, 'file-text': FileText,
  forward: Forward, graduation: GraduationCap, inbox: Inbox, info: Info, key: KeyRound, dashboard: LayoutDashboard,
  lock: Lock, logout: LogOut, mail: Mail, 'mail-open': MailOpen, 'mail-plus': MailPlus, megaphone: Megaphone,
  menu: Menu, paperclip: Paperclip, pen: PenLine, plus: Plus, printer: Printer, reply: Reply, 'reply-all': ReplyAll,
  refresh: RotateCw, logs: ScrollText, search: Search, 'search-x': SearchX, send: Send, settings: Settings2,
  shield: ShieldCheck, star: Star, trash: Trash2, alert: TriangleAlert, restore: Undo2, upload: Upload, user: User,
  'user-cog': UserCog, 'user-plus': UserPlus, users: Users, group: UsersRound, x: X,
} satisfies Record<string, LucideIconData>;

export type IconName = keyof typeof ICONS;

/** Icône Lucide : `<app-icon name="inbox" [size]="18" />` */
@Component({
  selector: 'app-icon',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<lucide-icon [img]="data()" [size]="size()" [strokeWidth]="strokeWidth()" [class.filled]="filled()" aria-hidden="true" />`,
  styles: `
    :host { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; line-height: 0; }
    .filled ::ng-deep svg { fill: currentColor; }
  `,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input(18);
  readonly strokeWidth = input(2);
  /** Remplit la forme (ex. étoile des favoris) */
  readonly filled = input(false);
  readonly data = computed(() => ICONS[this.name()]);
}
