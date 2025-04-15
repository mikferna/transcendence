import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

interface UserProfile {
  id: number;
  username: string;
  email: string;
  avatar: string | null;
  is_online: boolean;
  games_played: number;
  games_won: number;
  games_lost: number;
  date_joined: string;
  friends: Array<{
    id: number;
    username: string;
    avatar: string | null;
    is_online: boolean;
  }>;
  match_history: Array<{
    id: number;
    opponent: string;
    opponent_avatar: string | null;
    result: 'win' | 'loss';
    score: string;
    date: string;
  }>;
  is_friend: boolean;
  has_pending_request: boolean;
  is_current_user: boolean;
}

@Component({
  selector: 'app-user-profile',
  templateUrl: './user-profile.component.html',
  styleUrls: ['./user-profile.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class UserProfileComponent implements OnInit {
  profile: UserProfile | null = null;
  loading: boolean = true;
  error: string = '';
  username: string = '';
  currentUsername: string = '';

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute
  ) {
    // Intentar obtener el usuario actual desde localStorage
    this.getCurrentUser();
  }

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.username = params['username'];
      this.loadProfile();
    });
  }

  // Obtener el usuario actual desde localStorage o API
  getCurrentUser() {
    // Primero intentamos obtener del localStorage
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        this.currentUsername = user.username;
        return;
      } catch (e) {
        console.error('Error al leer usuario del localStorage:', e);
      }
    }
    
    // Si no hay en localStorage o falla, intentar con el nombre sencillo
    this.currentUsername = localStorage.getItem('username') || '';
    
    // Si sigue vacío y tenemos la API disponible, intentar obtenerlo de la API
    if (!this.currentUsername && environment.apiUrl) {
      this.http.get<any>(`${environment.apiUrl}/current-user/`).subscribe({
        next: (user) => {
          if (user && user.username) {
            this.currentUsername = user.username;
            // Guardar para futuras referencias
            localStorage.setItem('username', user.username);
          }
        },
        error: (error) => {
          console.error('Error al obtener usuario actual:', error);
        }
      });
    }
  }

  loadProfile() {
    this.loading = true;
    this.error = '';
    
    // Obtenemos la información del perfil directamente, que incluye el estado de amistad
    this.http.get(`${environment.apiUrl}/user/${this.username}/`).subscribe({
      next: (data: any) => {
        // Obtener información del perfil
        const profileData = data.user || data;
        
        // Obtener lista de amigos
        this.http.get(`${environment.apiUrl}/friends/${this.username}/list/`).subscribe({
          next: (friendsData: any) => {
            // Obtener historial de partidas
            this.http.get(`${environment.apiUrl}/matches/history/${this.username}/`).subscribe({
              next: (matchesData: any) => {
                // Obtener estado de la solicitud de amistad
                this.http.get(`${environment.apiUrl}/friend-requests/status/${this.username}/`).subscribe({
                  next: (statusData: any) => {
                    this.profile = {
                      ...profileData,
                      id: profileData.id,
                      date_joined: new Date(profileData.date_joined).toLocaleDateString(),
                      match_history: matchesData.matches || [],
                      friends: friendsData || [],
                      is_friend: statusData.is_friend,
                      has_pending_request: statusData.has_pending_request,
                      is_current_user: this.isCurrentUserProfile()
                    };
                    
                    this.loading = false;
                  },
                  error: (error) => {
                    console.error('Error al cargar estado de solicitud:', error);
                    this.loading = false;
                  }
                });
              },
              error: (error) => {
                console.error('Error al cargar historial de partidas:', error);
                this.loading = false;
              }
            });
          },
          error: (error) => {
            console.error('Error al cargar amigos:', error);
            this.loading = false;
          }
        });
      },
      error: (error) => {
        this.error = 'Error al cargar el perfil';
        this.loading = false;
        console.error('Error:', error);
      }
    });
  }

  // Método para verificar si el perfil es del usuario actual
  isCurrentUserProfile(): boolean {
    return this.username === this.currentUsername;
  }

  getAbsoluteAvatarUrl(avatarUrl: string | null): string {
    if (!avatarUrl) return 'assets/default-avatar.png';
    if (avatarUrl.startsWith('http')) return avatarUrl;
    return `http://localhost:8000${avatarUrl}`;
  }

  getWinRate(): number {
    if (!this.profile || this.profile.games_played === 0) return 0;
    return Math.round((this.profile.games_won / this.profile.games_played) * 100);
  }
}