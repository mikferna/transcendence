import { Component, OnInit, Output, EventEmitter, HostListener, ElementRef } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { UserSearchComponent } from '../user-search/user-search.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';  //añadir
import { trigger, state, style, animate, transition } from '@angular/animations';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css'],
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, UserSearchComponent],
  animations: [
    trigger('menuAnimation', [
      state('closed', style({
        opacity: 0,
        transform: 'translateY(-10px) scale(0.95)',
        visibility: 'hidden'
      })),
      state('open', style({
        opacity: 1,
        transform: 'translateY(0) scale(1)',
        visibility: 'visible'
      })),
      transition('closed => open', [
        animate('200ms cubic-bezier(0.35, 0.1, 0.25, 1.0)')
      ]),
      transition('open => closed', [
        animate('150ms cubic-bezier(0.35, 0.1, 0.25, 1.0)')
      ])
    ])
  ]
})
export class HeaderComponent implements OnInit {
  @Output() close = new EventEmitter<void>();
  
  currentUser: any;
  showUserSearch: boolean = false;
  isProfileMenuOpen: boolean = false;
  isMenuOpen: boolean = false;
  showNotifications: boolean = false;
  gearRotation: number = 0;
  friendRequests: any[] = [];

  // Añadimos estas tres propiedades:
  currentLanguage: string = 'es'; // Por defecto 'es' (o el que prefieras)
  currentTexts: any;
  translations: any = {
    es: {
      search: 'Buscar usuario...',
      account: 'Mi cuenta',
      language: 'Idioma',
      logout: 'Cerrar sesión',
      account_settings: 'Opciones de cuenta',
      my_profile: 'Mi Perfil',
      configuration: 'Configuración',
      friend_request: "Solicitudes de amistad",
      no_pending_requests: 'No hay solicitudes pendientes',
      spanish: 'Español',
      basque: 'Euskera',
      english: 'Inglés'
    },
    eus: {
      search: 'Erabiltzailea bilatu...',
      account: 'Nire kontua',
      language: 'Hizkuntza',
      logout: 'Saioa itxi',
      account_settings: 'Kontu aukerak',
      my_profile: 'Nire profila',
      configuration: 'Konfigurazioa',
      friend_request: "Lagun eskaerak",
      no_pending_requests: 'Ez dago eskaera berririk',
      spanish: 'Erdara',
      basque: 'Euskara',
      english: 'Ingelesa'
    },
    en: {
      search: 'Search user...',
      account: 'My account',
      language: 'Language',
      logout: 'Logout',
      account_settings: 'Account settings',
      my_profile: 'My Profile',
      configuration: 'Configuration',
      friend_request: "Friendship request",
      no_pending_requests: 'No pending requests',
      spanish: 'Spanish',
      basque: 'Basque',
      english: 'English'
    }
  };

  constructor(
    private router: Router,
    private authService: AuthService,
    private elementRef: ElementRef,
    private http: HttpClient
  ) {}

  ngOnInit() {
    const savedLanguage = localStorage.getItem('selectedLanguage');
    if (savedLanguage && this.translations[savedLanguage]) {
      this.currentLanguage = savedLanguage;
    }
    // Nos suscribimos al usuario actual
    this.currentTexts = this.translations[this.currentLanguage]; // Asigna los textos correspondientes al idioma
    // Imprime el idioma seleccionado en la consola
    console.log('Idioma seleccionado:', this.currentLanguage);

    this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
      if (user) {
        this.loadFriendRequests();
      }
    });
  }

  onLanguageChange(event: Event) {
    const selectedLang = (event.target as HTMLSelectElement).value;
    // Solo actualizar el idioma de sesión, no el idioma por defecto
    localStorage.setItem('selectedLanguage', selectedLang);
    window.location.reload();
  }

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
    if (this.isMenuOpen) {
      this.isProfileMenuOpen = false;
      this.showNotifications = false;
      this.gearRotation = 90;
      document.body.classList.add('menu-open');
    } else {
      this.gearRotation = 0;
      document.body.classList.remove('menu-open');
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const targetElement = event.target as HTMLElement;
    const clickedInside = this.elementRef.nativeElement.contains(targetElement);
    if (!clickedInside) {
      this.closeAllMenus();
    }
  }

  onMenuClick(event: MouseEvent) {
    event.stopPropagation();
  }

  toggleProfileMenu(event: MouseEvent) {
    event.stopPropagation();
    this.isProfileMenuOpen = !this.isProfileMenuOpen;
    if (this.isProfileMenuOpen) {
      this.isMenuOpen = false;
      this.showNotifications = false;
      this.gearRotation = 0;
    }
  }

  toggleNotifications(event: MouseEvent) {
    event.stopPropagation();
    this.showNotifications = !this.showNotifications;
    if (this.showNotifications) {
      this.isMenuOpen = false;
      this.isProfileMenuOpen = false;
      this.gearRotation = 0;
      this.loadFriendRequests();
    }
  }

  closeAllMenus() {
    this.isMenuOpen = false;
    this.isProfileMenuOpen = false;
    this.showNotifications = false;
    this.gearRotation = 0;
    document.body.classList.remove('menu-open');
  }

  navigateToSettings() {
    this.router.navigate(['/settings']);
    this.closeAllMenus();
  }

  navigateToProfile() {
    if (this.currentUser && this.currentUser.username) {
      this.router.navigate(['/profile', this.currentUser.username]);
      this.closeAllMenus();
    } else {
      console.error('No se pudo obtener el nombre de usuario actual');
    }
  }

  openUserSearch() {
    this.showUserSearch = true;
    this.closeAllMenus();
  }

  closeUserSearch() {
    this.showUserSearch = false;
  }

  logout() {
    this.authService.logout().subscribe({
      next: () => {
        if (!localStorage.getItem('is_42_user')) {
          this.router.navigate(['/']);
        }
        this.closeAllMenus();
      },
      error: (error) => {
        console.error('Error al cerrar sesión:', error);
        if (!localStorage.getItem('is_42_user')) {
          this.router.navigate(['/']);
        }
        this.closeAllMenus();
      }
    });
  }

  getAbsoluteAvatarUrl(avatarUrl: string): string {
    if (!avatarUrl) return '';
    if (avatarUrl.startsWith('http')) return avatarUrl;
    return `${environment.apiUrl}${avatarUrl}`;
  }

  loadFriendRequests() {
    this.http.get(`${environment.apiUrl}/friend-requests/list/`).subscribe({
      next: (data: any) => {
        this.friendRequests = data;
      },
      error: (error) => {
        console.error('Error al cargar solicitudes de amistad:', error);
      }
    });
  }

  acceptFriendRequest(requestId: number) {
    this.http.post(`${environment.apiUrl}/friend-requests/accept/${requestId}/`, {}).subscribe({
      next: () => {
        this.loadFriendRequests();
      },
      error: (error) => {
        console.error('Error al aceptar solicitud:', error);
      }
    });
  }

  declineFriendRequest(requestId: number) {
    this.http.post(`${environment.apiUrl}/friend-requests/decline/${requestId}/`, {}).subscribe({
      next: () => {
        this.loadFriendRequests();
      },
      error: (error) => {
        console.error('Error al rechazar solicitud:', error);
      }
    });
  }
}
