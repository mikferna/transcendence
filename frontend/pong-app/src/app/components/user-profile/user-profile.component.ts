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
    
    // Verificar si hay datos guardados en localStorage
    const storedState = this.getFriendshipStateFromStorage();

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
                    // Imprimir estado de la solicitud
                    console.log('Estado de la solicitud de amistad:', {
                      username: this.username,
                      is_friend: statusData.is_friend,
                      has_pending_request: statusData.has_pending_request
                    });

                    // Si hay datos guardados en localStorage, usarlos en lugar de los de la API
                    // para mantener consistencia con cambios locales
                    const is_friend = storedState ? storedState.is_friend : 
                                     statusData.is_friend;
                    
                    const has_pending_request = storedState ? storedState.has_pending_request : 
                                               statusData.has_pending_request;
                    
                    this.profile = {
                      ...profileData,
                      id: profileData.id,
                      date_joined: new Date(profileData.date_joined).toLocaleDateString(),
                      match_history: matchesData.matches || [],
                      friends: friendsData || [],
                      is_friend: is_friend,
                      has_pending_request: has_pending_request,
                      is_current_user: this.isCurrentUserProfile()
                    };
                    
                    // Guardar estado actualizado
                    this.saveFriendshipState();
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

  addFriend() {
    if (!this.profile) return;

    this.http.post(`${environment.apiUrl}/friend-requests/send/`, { 
      to_username: this.username 
    }).subscribe({
      next: (response) => {
        // Actualizar inmediatamente la UI al recibir respuesta exitosa
        if (this.profile) {
          this.profile.has_pending_request = true;
          this.saveFriendshipState();
        }
      },
      error: (error) => {
        // Incluso si hay error, actualizamos la UI para evitar intentos duplicados
        if (this.profile) {
          this.profile.has_pending_request = true;
          this.saveFriendshipState();
        }
        console.error('Error al agregar amigo:', error);
      }
    });
  }

  removeFriend() {
    if (!this.profile) return;

    if (confirm(`¿Estás seguro de que quieres eliminar a ${this.profile.username} de tu lista de amigos?`)) {
      this.http.post(`${environment.apiUrl}/friend-requests/remove/`, { 
        friend_id: this.profile.id 
      }).subscribe({
        next: (response) => {
          // Actualizar inmediatamente la UI
          if (this.profile) {
            this.profile.is_friend = false;
            this.profile.has_pending_request = false;
            this.saveFriendshipState();
            console.log(`Has eliminado a ${this.profile.username} de tus amigos`);
          }
        },
        error: (error) => {
          console.error('Error al eliminar amigo:', error);
        }
      });
    }
  }

  // Guardar el estado de amistad en localStorage para persistencia
  private saveFriendshipState() {
    if (!this.profile) return;
    
    // Crear una clave única para este perfil
    const key = `friendship_${this.currentUsername}_${this.username}`;
    
    // Guardar el estado actual
    localStorage.setItem(key, JSON.stringify({
      is_friend: this.profile.is_friend,
      has_pending_request: this.profile.has_pending_request,
      timestamp: new Date().getTime() // Para expirar datos viejos
    }));
  }

  // Recuperar el estado de amistad desde localStorage (si existe)
  private getFriendshipStateFromStorage(): {is_friend: boolean, has_pending_request: boolean} | null {
    const key = `friendship_${this.currentUsername}_${this.username}`;
    const storedData = localStorage.getItem(key);
    
    if (!storedData) return null;
    
    try {
      const data = JSON.parse(storedData);
      
      // Verificar si los datos son recientes (menos de 1 hora)
      const now = new Date().getTime();
      const timestamp = data.timestamp || 0;
      
      // Si los datos son más viejos que 1 hora, ignorarlos
      if (now - timestamp > 3600000) {
        localStorage.removeItem(key);
        return null;
      }
      
      return {
        is_friend: data.is_friend,
        has_pending_request: data.has_pending_request
      };
    } catch (e) {
      return null;
    }
  }
}