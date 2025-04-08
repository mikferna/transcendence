import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-user-search',
  templateUrl: './user-search.component.html',
  styleUrls: ['./user-search.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class UserSearchComponent implements OnInit {
  @Output() close = new EventEmitter<void>();
  searchQuery: string = '';
  users: any[] = [];
  error: string = '';
  loading: boolean = false;

  constructor(private http: HttpClient) {}

  ngOnInit() {}

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
        // Procesar las URLs de los avatares
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

  getAbsoluteAvatarUrl(avatarUrl: string): string {
    if (!avatarUrl) return '';
    if (avatarUrl.startsWith('http')) return avatarUrl;
    return `http://localhost:8000${avatarUrl}`;
  }

  sendFriendRequest(userId: number) {
    this.http.post(`${environment.apiUrl}/friend-requests/send/`, {
      to_username: this.users.find(u => u.id === userId)?.username
    }).subscribe({
      next: (response) => {
        // Actualizar el estado del usuario en la lista
        const user = this.users.find(u => u.id === userId);
        if (user) {
          user.friendRequestSent = true;
        }
      },
      error: (error) => {
        console.error('Error al enviar solicitud:', error);
      }
    });
  }

  blockUser(username: string) {
    this.http.post(`${environment.apiUrl}/block/${username}/`, {}).subscribe({
      next: (response) => {
        // Eliminar el usuario de la lista
        this.users = this.users.filter(u => u.username !== username);
      },
      error: (error) => {
        console.error('Error al bloquear usuario:', error);
      }
    });
  }
} 