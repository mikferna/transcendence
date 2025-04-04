import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent implements OnInit, OnDestroy {
  isMenuOpen = false;
  currentUser: any;
  private userSubscription: Subscription | undefined;

  constructor(
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.userSubscription = this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
      console.log('Current user updated:', user); // Para debugging
    });
  }

  ngOnDestroy() {
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
    }
  }

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
  }

  navigateToSettings() {
    this.router.navigate(['/settings']);
    this.isMenuOpen = false;
  }

  logout() {
    this.isMenuOpen = false;
    this.router.navigate(['/logout']);
  }
  // Agrega este método
  logAvatarUrl() {
    console.log('Current User Avatar URL:', this.currentUser?.avatar);
    return false; // para evitar navegación si está en un enlace
}
}