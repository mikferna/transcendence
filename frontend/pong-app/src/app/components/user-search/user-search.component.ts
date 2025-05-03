import { Component, OnInit, Output, EventEmitter, HostListener } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { trigger, style, animate, transition } from '@angular/animations';
import { Router } from '@angular/router';

interface User {
  id: number;
  username: string;
  avatar: string | null;
  is_online: boolean;
  is_friend: boolean;
  is_blocked: boolean;
  has_pending_request: boolean;
  pending_request_id?: number;
  request_direction?: 'sent' | 'received';
  sending_request?: boolean; // Nueva propiedad para controlar el estado de envío
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
  pendingRequests: any[] = [];

 // Añadimos estas tres propiedades:
 currentLanguage: string = 'es'; // Por defecto 'es' (o el que prefieras)
 currentTexts: any;
 translations: any = {
   es: {
     search_users: 'Buscar Usuarios',
     online: 'En línea',
     offline: 'Desconectado',
     request_received: 'Solicitud recibida',
     friend: 'Amigo',
     delete: 'Eliminar',
     pending: 'Pendiente',
     add: 'Agregar',
     bloqued: 'Bloqueado',
     searching_users: 'Buscando usuarios...',
     no_users_found: 'No se encontraron usuarios'
   },
   eus: {
    search_users: 'Erabiltzaileak Bilatu',
    online: 'Konektatuta',
    offline: 'Deskonektatuta',
    request_received: 'Eskaera jasota',
    friend: 'Laguna',
    delete: 'Ezabatu',
    pending: 'Zain',
    add: 'Gehitu',
    bloqued: 'Blokeatuta',
    searching_users: 'Erabiltzaileak bilatzen...',
    no_users_found: 'Ez da erabiltzailerik aurkitu'
   },
   en: {
    search_users: 'Search Users',
    online: 'Online',
    offline: 'Offline',
    request_received: 'Request Received',
    friend: 'Friend',
    delete: 'Delete',
    pending: 'Pending',
    add: 'Add',
    bloqued: 'Blocked',
    searching_users: 'Searching users...',
    no_users_found: 'No users found'
   }
 };

  constructor(
    private http: HttpClient,
    private router: Router
  ) {
    // Inicializar currentTexts en el constructor
    this.currentLanguage = localStorage.getItem('selectedLanguage') || 'es';
    this.currentTexts = this.translations[this.currentLanguage];
  }

  ngOnInit() {
    // Obtener el idioma almacenado
    const savedLanguage = localStorage.getItem('selectedLanguage');
    if (savedLanguage && this.translations[savedLanguage]) {
      this.currentLanguage = savedLanguage;
      this.currentTexts = this.translations[this.currentLanguage];
    }
    this.loadPendingRequests();
  }
  
  loadPendingRequests() {
    this.http.get(`${environment.apiUrl}/friend-requests/list/`).subscribe({
      next: (data: any) => {
        this.pendingRequests = data;
        // Si ya hay resultados de búsqueda, actualiza su estado
        if (this.users.length > 0) {
          this.processUserRequests();
        }
      },
      error: (error) => {
        console.error('Error al cargar solicitudes pendientes:', error);
      }
    });
  }

  @HostListener('click', ['$event'])
  onOverlayClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target.classList.contains('user-search-overlay')) {
      this.closeSearch();
    }
  }

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
          avatar: user.avatar ? this.getAbsoluteAvatarUrl(user.avatar) : null,
          sending_request: false // Inicializar el estado de envío
        }));
        
        this.processUserRequests();
        this.loading = false;
      },
      error: (error) => {
        this.error = 'Error al buscar usuarios';
        this.loading = false;
        console.error('Error:', error);
      }
    });
  }
  
  processUserRequests() {
    for (const user of this.users) {
      if (user.has_pending_request) {
        const receivedRequest = this.pendingRequests.find(req => 
          req.from_user.id === user.id
        );
        
        if (receivedRequest) {
          user.request_direction = 'received';
          user.pending_request_id = receivedRequest.id;
        } else {
          user.request_direction = 'sent';
        }
      }
    }
  }

  clearSearch() {
    this.searchQuery = '';
    this.users = [];
  }

  getAbsoluteAvatarUrl(avatarUrl: string): string {
    if (!avatarUrl) return '';
    if (avatarUrl.startsWith('http')) return avatarUrl;
    return `https://localhost:8000${avatarUrl}`;
  }

  sendFriendRequest(userId: number, event: Event) {
    event.stopPropagation();
    
    const user = this.users.find(u => u.id === userId);
    if (!user || user.sending_request) return; // Prevenir envíos múltiples

    // Marcar como en proceso para evitar doble envío
    user.sending_request = true;

    this.http.post(`${environment.apiUrl}/friend-requests/send/`, {
      to_username: user.username
    }).subscribe({
      next: (response) => {
        user.has_pending_request = true;
        user.request_direction = 'sent';
        user.sending_request = false; // Restablecer después del éxito
      },
      error: (error: HttpErrorResponse) => {
        console.error('Error al enviar solicitud:', error);
        
        // Si recibimos error por solicitud duplicada (400 con mensaje específico)
        if (error.status === 400 && error.error?.error === 'Friend request already sent') {
          // Actualizar UI como si la solicitud hubiera sido exitosa
          user.has_pending_request = true;
          user.request_direction = 'sent';
        } else if (error.status === 500) {
          // Si es un error 500, probablemente sea un duplicado no detectado
          // Actualizar UI como si la solicitud hubiera sido exitosa también
          user.has_pending_request = true;
          user.request_direction = 'sent';
        }
        
        user.sending_request = false; // Restablecer después del error
      }
    });
  }

  acceptFriendRequest(userId: number, requestId: number | undefined, event: Event) {
    event.stopPropagation();
    const user = this.users.find(u => u.id === userId);
    if (!user || !requestId || user.sending_request) return;

    user.sending_request = true;

    this.http.post(`${environment.apiUrl}/friend-requests/accept/${requestId}/`, {}).subscribe({
      next: (response) => {
        user.has_pending_request = false;
        user.is_friend = true;
        this.pendingRequests = this.pendingRequests.filter(req => req.id !== requestId);
        user.sending_request = false;
      },
      error: (error) => {
        console.error('Error al aceptar solicitud:', error);
        user.sending_request = false;
      }
    });
  }

  rejectFriendRequest(userId: number, requestId: number | undefined, event: Event) {
    event.stopPropagation();
    const user = this.users.find(u => u.id === userId);
    if (!user || !requestId || user.sending_request) return;

    user.sending_request = true;

    this.http.post(`${environment.apiUrl}/friend-requests/decline/${requestId}/`, {}).subscribe({
      next: (response) => {
        user.has_pending_request = false;
        this.pendingRequests = this.pendingRequests.filter(req => req.id !== requestId);
        user.sending_request = false;
      },
      error: (error) => {
        console.error('Error al rechazar solicitud:', error);
        user.sending_request = false;
      }
    });
  }

  removeFriend(userId: number, event: Event) {
    event.stopPropagation();
    const user = this.users.find(u => u.id === userId);
    if (!user || user.sending_request) return;

    if (confirm(`¿Estás seguro de que quieres eliminar a ${user.username} de tu lista de amigos?`)) {
      user.sending_request = true;
      
      this.http.post(`${environment.apiUrl}/friend-requests/remove/`, {
        friend_id: user.id
      }).subscribe({
        next: (response) => {
          user.is_friend = false;
          user.sending_request = false;
        },
        error: (error) => {
          console.error('Error al eliminar amigo:', error);
          user.sending_request = false;
        }
      });
    }
  }

  navigateToProfile(username: string, event: Event) {
    const target = event.target as HTMLElement;
    if (target.closest('.action-button')) {
      return;
    }
    
    this.router.navigate(['/profile', username]);
    this.closeSearch();
  }
}