from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils import timezone
import random
import string
from django.core.validators import FileExtensionValidator
import uuid
from datetime import timedelta


class User(AbstractUser):
    avatar = models.ImageField(
        upload_to='avatars/',
        default="avatars/noob.png",
        validators=[FileExtensionValidator(allowed_extensions=['jpg', 'jpeg', 'png'])]
    )
    ft_user = models.BooleanField(default=False)
    username = models.CharField(max_length=100, unique=True)
    email = models.EmailField(unique=True)
    password = models.CharField(max_length=100)
    tournament_name = models.CharField(max_length=100, unique=True, blank=True)
    is_online = models.BooleanField(default=False)
    games_played = models.PositiveIntegerField(default=0)
    games_won = models.PositiveIntegerField(default=0)
    games_lost = models.PositiveIntegerField(default=0)
    date_joined = models.DateTimeField(auto_now_add=True)
    friends = models.ManyToManyField('self', blank=True, symmetrical=True)
    blocked_users = models.ManyToManyField('self', symmetrical=False, related_name='blocked_by', blank=True)
    default_language = models.CharField(
        max_length=3,
        choices=[
            ('es', 'Spanish'),
            ('eus', 'Basque'),
            ('en', 'English')
        ],
        default='es'
    )

    REQUIRED_FIELDS = ['email']  # Added email as required for createsuperuser

    def __str__(self):
        return self.username

    def save(self, *args, **kwargs):
        if not self.pk and not self.tournament_name:  # Only set default for new instances without tournament_name
            # Generate a unique tournament name
            random_suffix = ''.join(random.choices(string.digits, k=6))  # Using 6 digits reduces duplicate chance
            self.tournament_name = f"noob{random_suffix}"
            
            # Check if the generated name exists, regenerate if needed
            while User.objects.filter(tournament_name=self.tournament_name).exists():
                random_suffix = ''.join(random.choices(string.digits, k=6))
                self.tournament_name = f"noob{random_suffix}"
                
        super().save(*args, **kwargs)


class FriendRequest(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('accepted', 'Accepted'),
        ('declined', 'Declined')
    ]
    
    from_user = models.ForeignKey(User, related_name='sent_friend_requests', on_delete=models.CASCADE)
    to_user = models.ForeignKey(User, related_name='received_friend_requests', on_delete=models.CASCADE)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ('from_user', 'to_user')
        
    def __str__(self):
        return f"{self.from_user.username} to {self.to_user.username} - {self.status}"

class Match(models.Model):
    MATCH_TYPES = [
        ('tournament', 'Tournament'),
        ('local', 'Local'),
        ('ai', 'Against AI'),
        ('3players', '3 Players'),  # Nuevo tipo para 1v1v1
        ('4players', '4 Players')   # Nuevo tipo para 1v1v1v1
    ]
    
    AI_DIFFICULTY = [
        ('easy', 'Easy'),
        ('hard', 'Hard')
    ]
    
    player1 = models.ForeignKey(User, related_name='matches_as_player1', on_delete=models.CASCADE)
    player2 = models.ForeignKey(User, related_name='matches_as_player2', on_delete=models.CASCADE, null=True, blank=True)
    player3 = models.ForeignKey(User, related_name='matches_as_player3', on_delete=models.CASCADE, null=True, blank=True)
    player4 = models.ForeignKey(User, related_name='matches_as_player4', on_delete=models.CASCADE, null=True, blank=True)
    
    is_against_ai = models.BooleanField(default=False)
    ai_difficulty = models.CharField(max_length=10, choices=AI_DIFFICULTY, null=True, blank=True)
    
    player1_score = models.IntegerField(default=0)
    player2_score = models.IntegerField(default=0)
    player3_score = models.IntegerField(default=0)
    player4_score = models.IntegerField(default=0)
    
    winner = models.ForeignKey(User, related_name='matches_won', on_delete=models.CASCADE, null=True, blank=True)
    is_player1_winner = models.BooleanField(default=False)  # Mantenemos por compatibilidad
    
    match_date = models.DateTimeField(auto_now_add=True)
    match_type = models.CharField(max_length=20, choices=MATCH_TYPES)
    
    class Meta:
        ordering = ['-match_date']
    
    def __str__(self):
        if self.is_against_ai:
            difficulty = dict(self.AI_DIFFICULTY).get(self.ai_difficulty, '')
            return f"{self.player1.username} vs AI ({difficulty}) - {self.match_date.strftime('%Y-%m-%d')}"
        elif self.match_type == '3players' and self.player3:
            return f"{self.player1.username} vs {self.player2.username} vs {self.player3.username} - {self.match_date.strftime('%Y-%m-%d')}"
        elif self.match_type == '4players' and self.player4:
            return f"{self.player1.username} vs {self.player2.username} vs {self.player3.username} vs {self.player4.username} - {self.match_date.strftime('%Y-%m-%d')}"
        else:
            return f"{self.player1.username} vs {self.player2.username} - {self.match_date.strftime('%Y-%m-%d')}"
    
    def clean(self):
        """Validar los datos del partido"""
        from django.core.exceptions import ValidationError
        
        if self.is_against_ai:
            if not self.ai_difficulty:
                raise ValidationError("Se requiere especificar la dificultad de la IA")
            if self.player2 is not None:
                raise ValidationError("El jugador 2 debe estar vacío para partidos contra IA")
        elif self.match_type == 'local':
            if self.player2 is None:
                raise ValidationError("Se requiere el jugador 2 para partidos entre humanos")
        elif self.match_type == '3players':
            if self.player2 is None or self.player3 is None:
                raise ValidationError("Se requieren 3 jugadores para el modo 3 jugadores")
        elif self.match_type == '4players':
            if self.player2 is None or self.player3 is None or self.player4 is None:
                raise ValidationError("Se requieren 4 jugadores para el modo 4 jugadores")
    
    def save(self, *args, **kwargs):
        self.clean()
        is_new = self.pk is None
        
        if is_new:
            # Actualizar estadísticas de juego para cada jugador
            self.player1.games_played += 1
            
            if not self.is_against_ai:
                if self.player2:
                    self.player2.games_played += 1
                if self.player3:
                    self.player3.games_played += 1
                if self.player4:
                    self.player4.games_played += 1
                
                # Actualizar estadísticas de victoria/derrota
                if self.winner:
                    if self.winner == self.player1:
                        self.player1.games_won += 1
                        if self.player2:
                            self.player2.games_lost += 1
                        if self.player3:
                            self.player3.games_lost += 1
                        if self.player4:
                            self.player4.games_lost += 1
                    elif self.player2 and self.winner == self.player2:
                        self.player2.games_won += 1
                        self.player1.games_lost += 1
                        if self.player3:
                            self.player3.games_lost += 1
                        if self.player4:
                            self.player4.games_lost += 1
                    elif self.player3 and self.winner == self.player3:
                        self.player3.games_won += 1
                        self.player1.games_lost += 1
                        if self.player2:
                            self.player2.games_lost += 1
                        if self.player4:
                            self.player4.games_lost += 1
                    elif self.player4 and self.winner == self.player4:
                        self.player4.games_won += 1
                        self.player1.games_lost += 1
                        if self.player2:
                            self.player2.games_lost += 1
                        if self.player3:
                            self.player3.games_lost += 1
                
                # Guardar cambios en los jugadores
                if self.player2:
                    self.player2.save()
                if self.player3:
                    self.player3.save()
                if self.player4:
                    self.player4.save()
            else:
                # Partida contra IA
                if self.is_player1_winner:
                    self.player1.games_won += 1
                else:
                    self.player1.games_lost += 1
            
            self.player1.save()
            
        super().save(*args, **kwargs)

class AccountActivateTokenManager(models.Manager):
    def activate_user_by_token(self, token):
        try:
            token_obj = self.get(token=token)
            
            # Check if token is expired
            if timezone.now() > token_obj.expires_at:
                return None
                
            user = token_obj.user
            if not user.is_active:
                user.is_active = True
                user.save(update_fields=['is_active'])
            return user
        except self.model.DoesNotExist:
            return None

class AccountActivateToken(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    token = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    
    objects = AccountActivateTokenManager()
    
    def save(self, *args, **kwargs):
        if not self.expires_at:
            # Set token to expire after 48 hours
            self.expires_at = timezone.now() + timedelta(hours=48)
        super().save(*args, **kwargs)