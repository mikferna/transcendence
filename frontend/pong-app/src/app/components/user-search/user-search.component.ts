import { Component, OnInit, Output, EventEmitter, HostListener } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { trigger, style, animate, transition } from '@angular/animations';

interface User {
  id: number;
  username: string;
  avatar: string | null;
  is_online: boolean;
  is_friend: boolean;
  is_blocked: boolean;
  has_pending_request: boolean;
}

@Component({
  selector: 'app-user-search',
  templateUrl: './user-search.component.html',
  styleUrls: ['./user-search.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule],
  animations: [
    trigger('fadeAnimation', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('300ms ease-out', style({ opacity: 1 }))
      ]),
      transition(':leave', [
        animate('250ms ease-in', style({ opacity: 0 }))
      ])
    ]),
    trigger('slideAnimation', [
      transition(':enter', [
        style({ transform: 'translateY(20px)', opacity: 0 }),
        animate('400ms cubic-bezier(0.35, 0.1, 0.25, 1.0)', 
               style({ transform: 'translateY(0)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('300ms cubic-bezier(0.35, 0.1, 0.25, 1.0)', 
               style({ transform: 'translateY(20px)', opacity: 0 }))
      ])
    ]),
    trigger('cardAnimation', [
      transition(':enter', [
        style({ transform: 'translateY(15px)', opacity: 0 }),
        animate('300ms {{delay}}ms cubic-bezier(0.35, 0.1, 0.25, 1.0)', 
               style({ transform: 'translateY(0)', opacity: 1 }))
      ], { params: { delay: 0 } })
    ])
  ]
})
export class UserSearchComponent implements OnInit {
  @Output() close = new EventEmitter<void>();
  searchQuery: string = '';
  users: User[] = [];
  error: string = '';
  loading: boolean = false;

  constructor(private http: HttpClient) {}

  ngOnInit() {}

  // Método para cerrar cuando se hace clic fuera del contenedor
  @HostListener('click', ['$event'])
  onOverlayClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target.classList.contains('user-search-overlay')) {
      this.closeSearch();
    }
  }

  // Método para cerrar con la tecla Escape
  @HostListener('document:keydown.escape')
  onEscapePress() {
    this.closeSearch();
  }

  closeSearch() {
    this.close.emit();
  }

  searchUsers() {
    if (!this.searchQuery.trim()) {
      this.users = [];
      return;
    }

    this.loading = true;
    this.error = '';

    this.http.get(`${environment.apiUrl}/users/search/?query=${this.searchQuery}`).subscribe({
      next: (data: any) => {
        this.users = data.map((user: any) => ({
          ...user,
          avatar: user.avatar ? this.getAbsoluteAvatarUrl(user.avatar) : null
        }));
        this.loading = false;
      },
      error: (error) => {
        this.error = 'Error al buscar usuarios';
        this.loading = false;
        console.error('Error:', error);
      }
    });
  }

  clearSearch() {
    this.searchQuery = '';
    this.users = [];
  }

  getAbsoluteAvatarUrl(avatarUrl: string): string {
    if (!avatarUrl) return '';
    if (avatarUrl.startsWith('http')) return avatarUrl;
    return `http://localhost:8000${avatarUrl}`;
  }

  sendFriendRequest(userId: number) {
    const user = this.users.find(u => u.id === userId);
    if (!user) return;

    this.http.post(`${environment.apiUrl}/friend-requests/send/`, {
      to_username: user.username
    }).subscribe({
      next: (response) => {
        user.has_pending_request = true;
      },
      error: (error) => {
        console.error('Error al enviar solicitud:', error);
      }
    });
  }

  blockUser(username: string) {
    this.http.post(`${environment.apiUrl}/block/${username}/`, {}).subscribe({
      next: (response) => {
        const user = this.users.find(u => u.username === username);
        if (user) {
          user.is_blocked = true;
        }
      },
      error: (error) => {
        console.error('Error al bloquear usuario:', error);
      }
    });
  }

  unblockUser(username: string) {
    this.http.post(`${environment.apiUrl}/unblock/${username}/`, {}).subscribe({
      next: (response) => {
        const user = this.users.find(u => u.username === username);
        if (user) {
          user.is_blocked = false;
        }
      },
      error: (error) => {
        console.error('Error al desbloquear usuario:', error);
      }
    });
  }
}