import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-user-settings',
  templateUrl: './user-settings.component.html',
  styleUrls: ['./user-settings.component.css'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule]
})
export class UserSettingsComponent implements OnInit {
  userForm: FormGroup;
  currentUser: any;
  avatarPreview: string | null = null;
  selectedFile: File | null = null;
  message: string = '';
  error: string = '';
  currentLanguage: string = 'es';
  currentTexts: any;

  translations: any = {
    es: {
      account_settings: 'Configuración de la cuenta',
      email: 'Correo electrónico',
      username: 'Nombre de usuario',
      email_required: 'El correo electrónico es requerido',
      insert_valid_email: 'Ingresa un correo electrónico válido',
      username_required: 'El nombre de usuario es requerido',
      username_max_length: 'El nombre de usuario no puede exceder los 30 caracteres',
      save_changes: 'Guardar cambios',
      profile_updated: 'Perfil actualizado exitosamente',
      error_loading_user: 'Error al cargar los datos del usuario',
      error_updating_profile: 'Error al actualizar el perfil',
      image_too_large: 'La imagen no puede superar los 2MB',
      select_language: 'Seleccionar idioma',
      spanish: 'Español',
      basque: 'Euskera',
      english: 'Inglés',
      change_session_language: 'La preferencia de idioma del usuario se ha modificado. ¿Desea cambiar también el idioma de la sesión actual?',
      change_avatar: 'Cambiar avatar',
      ft_user_restriction: 'Los usuarios 42 no pueden cambiar su nombre de usuario ni correo electrónico'
    },
    eus: {
      account_settings: 'Kontuaren ezarpenak',
      email: 'Posta elektronikoa',
      username: 'Erabiltzaile izena',
      email_required: 'Posta elektronikoa beharrezkoa da',
      insert_valid_email: 'Sartu baliozko posta elektronikoa',
      username_required: 'Erabiltzaile izena beharrezkoa da',
      username_max_length: 'Erabiltzaile izenak ezin ditu 30 karaktere baino gehiago izan',
      save_changes: 'Aldaketak gorde',
      profile_updated: 'Profila eguneratu da',
      error_loading_user: 'Errorea erabiltzailearen datuak kargatzean',
      error_updating_profile: 'Errorea profila eguneratzean',
      image_too_large: 'Irudiak ezin ditu 2MB baino gehiago izan',
      select_language: 'Hizkuntza aukeratu',
      spanish: 'Gaztelania',
      basque: 'Euskara',
      english: 'Ingelesa',
      change_session_language: 'Erabiltzailearen hizkuntza lehentasuna aldatu da. Saio honetako hizkuntza ere aldatu nahi duzu?',
      change_avatar: 'Aldatu irudia',
      ft_user_restriction: '42 erabiltzaileek ezin dute erabiltzaile izena edo posta elektronikoa aldatu'
    },
    en: {
      account_settings: 'Account Settings',
      email: 'Email',
      username: 'Username',
      email_required: 'Email is required',
      insert_valid_email: 'Please enter a valid email',
      username_required: 'Username is required',
      username_max_length: 'Username must not exceed 30 characters',
      save_changes: 'Save changes',
      profile_updated: 'Profile updated successfully',
      error_loading_user: 'Error loading user data',
      error_updating_profile: 'Error updating profile',
      image_too_large: 'Image cannot exceed 2MB',
      select_language: 'Select language',
      spanish: 'Spanish',
      basque: 'Basque',
      english: 'English',
      change_session_language: 'User language preference has been modified. Do you want to change the current session language as well?',
      change_avatar: 'Change avatar',
      ft_user_restriction: '42 users cannot change their username or email'
    }
  };

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private fb: FormBuilder
  ) {
    this.userForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      username: ['', [Validators.required, Validators.maxLength(30)]],
      avatar: [null],
      default_language: ['es', Validators.required]
    });

    // Inicializar el idioma actual
    const savedLanguage = localStorage.getItem('selectedLanguage');
    if (savedLanguage && this.translations[savedLanguage]) {
      this.currentLanguage = savedLanguage;
    }
    this.currentTexts = this.translations[this.currentLanguage];
  }

  ngOnInit() {
    this.loadUserData();
    // Nos suscribimos al usuario actual
    this.currentTexts = this.translations[this.currentLanguage]; // Asigna los textos correspondientes al idioma
    // Imprime el idioma seleccionado en la consola
    console.log('Idioma seleccionado:', this.currentLanguage);
  }

  loadUserData() {
    interface CurrentUser {
      username: string;
      email: string;
      default_language: string;
      tournament_name?: string;
      avatar?: string;
      ft_user?: boolean; // Añadir el campo ft_user
    }

    this.http.get<CurrentUser>(`${environment.apiUrl}/current-user/`).subscribe({
      next: (data: CurrentUser) => {
        this.currentUser = data;
        
        // Imprimir en consola el valor de ft_user
        console.log('Usuario 42 (ft_user):', this.currentUser.ft_user);
        
        this.userForm.patchValue({
          username: data.username,
          email: data.email,
          default_language: data.default_language,
          tournament_name: data.tournament_name
        });
        
        // Deshabilitar campos si el usuario es ft_user
        if (data.ft_user) {
          this.userForm.get('username')?.disable();
          this.userForm.get('email')?.disable();
          console.log('Campos username y email deshabilitados por ser usuario 42');
        }
        
        if (data.avatar) {
          if (!data.avatar.startsWith('http')) {
            this.avatarPreview = `https://localhost:8000${data.avatar}`;
          } else {
            this.avatarPreview = data.avatar;
          }
        }
      },
      error: (error: any) => {
        console.error('Error al cargar los datos del usuario:', error);
        this.error = 'Error al cargar los datos del usuario';
      }
    });
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        this.error = 'La imagen no puede superar los 2MB';
        return;
      }
      this.selectedFile = file;
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.avatarPreview = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  onSubmit() {
    if (this.userForm.valid) {
      const formData = new FormData();
      
      // Si el usuario es ft_user, no enviamos username ni email
      if (!this.currentUser.ft_user) {
        formData.append('email', this.userForm.get('email')?.value);
        formData.append('username', this.userForm.get('username')?.value);
      } else {
        console.log('No se envían campos username y email porque es usuario 42');
      }
      
      formData.append('default_language', this.userForm.get('default_language')?.value);
      
      if (this.selectedFile) {
        formData.append('avatar', this.selectedFile);
      }

      this.http.patch<{ message: string }>(`${environment.apiUrl}/user_update/`, formData).subscribe({
        next: (response: { message: string }) => {
          this.message = this.currentTexts.profile_updated;
          this.error = '';
          
          // Manejo del cambio de idioma
          const newLanguage: string | null = this.userForm.get('default_language')?.value;
          if (newLanguage) {
            localStorage.setItem('defaultLanguage', newLanguage);
            // Preguntar si quiere cambiar también el idioma de sesión
            if (confirm(this.currentTexts.change_session_language)) {
              localStorage.setItem('selectedLanguage', newLanguage);
              // Actualizamos los datos del usuario antes de recargar
              this.authService.updateCurrentUser().subscribe({
                next: (user: any) => {
                  console.log('Datos de usuario actualizados en toda la aplicación');
                  window.location.reload();
                },
                error: (err: any) => {
                  console.error('Error al actualizar los datos de usuario en la aplicación', err);
                }
              });
            } else {
              // Si no quiere cambiar el idioma de sesión, solo actualizamos los datos
              this.authService.updateCurrentUser().subscribe({
                next: (user: any) => {
                  console.log('Datos de usuario actualizados en toda la aplicación');
                },
                error: (err: any) => {
                  console.error('Error al actualizar los datos de usuario en la aplicación', err);
                }
              });
            }
          } else {
            // Si no hay cambio de idioma, solo actualizamos los datos
            this.authService.updateCurrentUser().subscribe({
              next: (user: any) => {
                console.log('Datos de usuario actualizados en toda la aplicación');
              },
              error: (err: any) => {
                console.error('Error al actualizar los datos de usuario en la aplicación', err);
              }
            });
          }
        },
        error: (error: { error: { error: string } }) => {
          this.error = error.error.error || this.currentTexts.error_updating_profile;
          this.message = '';
        }
      });
    }
  }
  
  // Método para verificar si el usuario es ft_user
  isFtUser(): boolean {
    return this.currentUser?.ft_user === true;
  }
}