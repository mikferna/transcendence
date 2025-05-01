import { Component, OnInit, OnDestroy } from '@angular/core';
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
    player1: string;
    player2: string;
    player3?: string;
    player4?: string;
    player1_username: string;
    player2_username: string;
    player3_username?: string;
    player4_username?: string;
    player1_score: number;
    player2_score: number;
    player3_score?: number;
    player4_score?: number;
    winner: string;
    winner_username: string;
    match_date: string;
    is_against_ai: boolean;
    ai_difficulty?: string;
    match_type: string;
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
export class UserProfileComponent implements OnInit, OnDestroy {
  profile: UserProfile | null = null;
  loading: boolean = true;
  error: string = '';
  username: string = '';
  currentUsername: string = '';
  private statusUpdateInterval: any = null;
 // Añadimos estas tres propiedades:
 currentLanguage: string = 'es'; // Por defecto 'es' (o el que prefieras)
 currentTexts: any;
 translations: any = {
   es: {
     matches: 'PARTIDAS',
     wins: 'VICTORIAS',
     efficiency: 'EFICIENCIA',
     contacts: 'CONTACTOS',
     no_contacts_found_ddbb: 'NO CONTACTOS ENCONTRADOS EN LA BASE DE DATOS',
     combats_registry: 'REGISTRO DE COMBATES',
     win: 'VICTORIA',
     lose: 'DERROTA',
     no_combat_registry_found_ddbb: 'NO HAY REGISTROS DE COMBATE EN LA BASE DE DATOS',
     contact_established: 'CONTACTO ESTABLECIDO',
     pending_request: 'SOLICITUD PENDIENTE',
     add_contact: 'AÑADIR CONTACTO',
     start_combat: 'INICIAR COMBATE',
     accessing_system: 'ACCEDIENDO AL SISTEMA...',
     system_error: 'ERROR DE SISTEMA:',
     connected: 'CONECTADO',
     disconnected: 'DESCONECTADO'
   },
   eus: {
    matches: 'PARTIDAK',
    wins: 'GARAIPENAK',
    efficiency: 'ERAGINKORTASUNA',
    contacts: 'KONTAKTUAK',
    no_contacts_found_ddbb: 'EZ DA KONTAKTURIK AURKITU DATU-BASEAN',
    combats_registry: 'BORROKA ERREGISTROA',
    win: 'GARAIPENA',
    lose: 'PORROTA',
    no_combat_registry_found_ddbb: 'EZ DA BORROKA ERREGISTRORIK AURKITU DATU-BASEAN',
    contact_established: 'KONTAKTUA EZARRITA',
    pending_request: 'ESKAERA ZAIN',
    add_contact: 'KONTAKTUA GEHITU',
    start_combat: 'BORROKA HASI',
    accessing_system: 'SISTEMARA SARTZEN...',
    system_error: 'SISTEMA ERROREA:',
    connected: 'KONEKTATUTA',
    disconnected: 'DESKONEKTATUTA'
   },
   en: {
     matches: 'MATCHES',
     wins: 'WINS',
     efficiency: 'EFFICIENCY',
     contacts: 'CONTACTOS',
     no_contacts_found_ddbb: 'NO CONTACTS FOUND ON THE DATABASE',
     combats_registry: 'COMBAT REGISTRY',
     win: 'WIN',
     lose: 'LOSE',
     no_combat_registry_found_ddbb: 'NO COMBAT REGISTRYS FOUND ON THE DATABASE',
     contact_established: 'CONTACT ESTABLISHED',
     pending_request: 'PENDING REQUEST',
     add_contact: 'ADD CONTACT',
     start_combat: 'START COMBAT',
     accessing_system: 'ACCESSING SYSTEM...',
     system_error: 'SYSTEM ERROR:',
     connected: 'CONNECTED',
     disconnected: 'DESCONCECTED'
   }
 };

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

    const savedLanguage = localStorage.getItem('selectedLanguage');
    if (savedLanguage && this.translations[savedLanguage]) {
      this.currentLanguage = savedLanguage;
    }
    // Nos suscribimos al usuario actual
    this.currentTexts = this.translations[this.currentLanguage]; // Asigna los textos correspondientes al idioma
    // Imprime el idioma seleccionado en la consola
    console.log('Idioma seleccionado:', this.currentLanguage);

    // Verifica que `accessing_system` esté presente
    console.log('accessing_system:', this.currentTexts?.accessing_system);
  }
  
  ngOnDestroy() {
    // Limpiar el intervalo cuando se destruye el componente
    if (this.statusUpdateInterval) {
      clearInterval(this.statusUpdateInterval);
    }
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
        
        // Verificar que tenemos el ID del usuario
        console.log('Datos recibidos de la API:', profileData);
        
        // Obtener lista de amigos
        this.http.get(`${environment.apiUrl}/friends/${this.username}/list/`).subscribe({
          next: (friendsData: any) => {
            // Obtener historial de partidas
            this.http.get(`${environment.apiUrl}/matches/history/${this.username}/`).subscribe({
              next: (matchesData: any) => {
                // Obtener estado de la solicitud de amistad
                this.http.get(`${environment.apiUrl}/friend-requests/status/${this.username}/`).subscribe({
                  next: (statusData: any) => {
                    // Asegurarnos de que el ID existe
                    if (!profileData.id) {
                      // Intentar obtener el ID del usuario actual
                      this.http.get(`${environment.apiUrl}/current-user/`).subscribe({
                        next: (currentUserData: any) => {
                          if (currentUserData && currentUserData.id) {
                            profileData.id = currentUserData.id;
                          }
                          this.createProfile(profileData, friendsData, matchesData, statusData);
                        },
                        error: (error) => {
                          this.createProfile(profileData, friendsData, matchesData, statusData);
                        }
                      });
                    } else {
                      this.createProfile(profileData, friendsData, matchesData, statusData);
                    }
                  },
                  error: (error) => {
                    this.loading = false;
                  }
                });
              },
              error: (error) => {
                this.loading = false;
              }
            });
          },
          error: (error) => {
            this.loading = false;
          }
        });
      },
      error: (error) => {
        this.error = 'Error al cargar el perfil';
        this.loading = false;
      }
    });
  }
  
  // Método auxiliar para crear el perfil
  private createProfile(profileData: any, friendsData: any, matchesData: any, statusData: any): void {
    this.profile = {
      ...profileData,
      id: profileData.id || 0, // Asegurar que siempre haya un valor para id
      date_joined: new Date(profileData.date_joined).toLocaleDateString(),
      match_history: matchesData.matches || [],
      friends: friendsData || [],
      is_friend: statusData.is_friend,
      has_pending_request: statusData.has_pending_request,
      is_current_user: this.isCurrentUserProfile()
    };
    
    this.loading = false;
  }

  // Método para verificar si el perfil es del usuario actual
  isCurrentUserProfile(): boolean {
    return this.username === this.currentUsername;
  }

  getAbsoluteAvatarUrl(avatarUrl: string | null): string {
    if (!avatarUrl) return 'assets/default-avatar.png';
    if (avatarUrl.startsWith('https')) return avatarUrl;
    return `https://localhost:8000${avatarUrl}`;
  }

  getWinRate(): number {
    if (!this.profile || this.profile.games_played === 0) return 0;
    return Math.round((this.profile.games_won / this.profile.games_played) * 100);
  }
  
  // Método para actualizar solo el estado online/offline
  updateOnlineStatus() {
    if (!this.profile) return;
    
    // Usar el endpoint específico para estado online
    this.http.get(`${environment.apiUrl}/user/${this.username}/online-status/`).subscribe({
      next: (data: any) => {
        if (this.profile && data) {
          // Actualizar el estado online del usuario
          this.profile.is_online = data.is_online;
          
          // Actualizar el estado online de los amigos
          if (data.friends && Array.isArray(data.friends) && this.profile.friends) {
            data.friends.forEach((friendStatus: any) => {
              const friendIndex = this.profile?.friends.findIndex(f => f.id === friendStatus.id);
              if (friendIndex !== -1 && friendIndex !== undefined && this.profile) {
                this.profile.friends[friendIndex].is_online = friendStatus.is_online;
              }
            });
          }
        }
      },
      error: (error) => {
        console.error('Error al actualizar estado online:', error);
        // No mostrar error al usuario para no interrumpir la experiencia
      }
    });
  }
}