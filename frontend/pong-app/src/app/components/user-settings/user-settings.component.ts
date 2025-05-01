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
      change_avatar: 'Cambiar avatar'
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
      change_avatar: 'Aldatu irudia'
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
      change_avatar: 'Change avatar'
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
    this.http.get(`${environment.apiUrl}/current-user/`).subscribe({
      next: (data: any) => {
        this.currentUser = data;
        this.userForm.patchValue({
          username: data.username,
          email: data.email,
          default_language: data.default_language,
          tournament_name: data.tournament_name
        });
        if (data.avatar) {
          if (!data.avatar.startsWith('http')) {
            this.avatarPreview = `https://localhost:8000${data.avatar}`;
          } else {
            this.avatarPreview = data.avatar;
          }
        }
      },
      error: (error) => {
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
      formData.append('email', this.userForm.get('email')?.value);
      formData.append('username', this.userForm.get('username')?.value);
      formData.append('default_language', this.userForm.get('default_language')?.value);
      
      if (this.selectedFile) {
        formData.append('avatar', this.selectedFile);
      }

      this.http.post(`${environment.apiUrl}/user_update/`, formData).subscribe({
        next: (response: any) => {
          this.message = this.currentTexts.profile_updated;
          this.error = '';
          
          // Al actualizar la preferencia de idioma
          const newLanguage = this.userForm.get('default_language')?.value;
          if (newLanguage) {
            localStorage.setItem('defaultLanguage', newLanguage);
            // Preguntar si quiere cambiar también el idioma de sesión
            if (confirm(this.currentTexts.change_session_language)) {
              localStorage.setItem('selectedLanguage', newLanguage);
              window.location.reload();
            }
          }
        },
        error: (error) => {
          this.error = error.error.error || this.currentTexts.error_updating_profile;
          this.message = '';
        }
      });
    }
  }
}