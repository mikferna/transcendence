import { Component, OnInit, OnDestroy, HostListener, ElementRef, ChangeDetectorRef } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { Subscription } from 'rxjs';
import { trigger, state, style, animate, transition } from '@angular/animations';
import { UserSearchComponent } from '../user-search/user-search.component';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css'],
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
  ],
  standalone: true,
  imports: [CommonModule, RouterModule, UserSearchComponent]
})
export class HeaderComponent implements OnInit, OnDestroy {
  isMenuOpen = false;
  showUserSearch = false;
  currentUser: any;
  gearRotation = 0;
  private userSubscription: Subscription | undefined;
  defaultAvatar = 'assets/default-avatar.png';

  constructor(
    private router: Router,
    private authService: AuthService,
    private elementRef: ElementRef,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.userSubscription = this.authService.currentUser$.subscribe(user => {
      if (user && user.avatar) {
        if (!user.avatar.startsWith('http')) {
          user.avatar = `http://localhost:8000/${user.avatar}`;
        }
      }
      this.currentUser = user;
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy() {
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
    }
  }

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
    if (this.isMenuOpen) {
      // Rotar el engranaje cuando se abre el menú
      this.gearRotation = 90;
      // Agregar clase al body para evitar scroll cuando el menú está abierto
      document.body.classList.add('menu-open');
    } else {
      this.gearRotation = 0;
      document.body.classList.remove('menu-open');
    }
  }

  // Cerrar el menú al hacer clic en cualquier lugar fuera del header
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const targetElement = event.target as HTMLElement;
    // Verificar si el clic fue fuera del menú y del botón de perfil
    const clickedInside = this.elementRef.nativeElement.contains(targetElement);
    
    if (!clickedInside && this.isMenuOpen) {
      this.isMenuOpen = false;
      this.gearRotation = 0;
      document.body.classList.remove('menu-open');
    }
  }

  // Detener la propagación del clic dentro del menú para evitar que se cierre
  onMenuClick(event: MouseEvent) {
    event.stopPropagation();
  }

  navigateToSettings() {
    this.router.navigate(['/settings']);
    this.isMenuOpen = false;
    this.gearRotation = 0;
    document.body.classList.remove('menu-open');
  }

  openUserSearch() {
    this.showUserSearch = true;
    this.isMenuOpen = false;
  }

  closeUserSearch() {
    this.showUserSearch = false;
  }

  logout() {
    this.isMenuOpen = false;
    this.gearRotation = 0;
    document.body.classList.remove('menu-open');
    this.router.navigate(['/logout']);
  }

  handleImageError() {
    if (this.currentUser) {
      this.currentUser.avatar = this.defaultAvatar;
    }
  }
}