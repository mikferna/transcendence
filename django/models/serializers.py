from rest_framework import serializers
from .models import *

class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(required=True)
    password = serializers.CharField(required=True, write_only=True)
    
    def validate(self, data):
        username = data.get('username', '').strip()
        password = data.get('password', '').strip()
        
        if not username or not password:
            raise serializers.ValidationError('Username and password are required')
        return data

class RegisterSerializer(serializers.ModelSerializer):
    password2 = serializers.CharField(write_only=True)
    default_language = serializers.ChoiceField(
        choices=['es', 'eus', 'en'],
        default='es'
    )

    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'password2', 'default_language']
        extra_kwargs = {
            'password': {'write_only': True}
        }
    
    password = serializers.CharField(max_length=16, write_only=True)
    password2 = serializers.CharField(max_length=16, write_only=True)

    def validate(self, attrs):
        username = attrs.get('username', '').strip()
        password = attrs.get('password', '').strip()
        password2 = attrs.get('password2', '').strip()
        email = attrs.get('email', '').strip()
    
        if not username:
            raise serializers.ValidationError({'username': 'Username is required'})
        if not password:
            raise serializers.ValidationError({'password': 'Password is required'})
        if not password2:
            raise serializers.ValidationError({'password2': 'Password confirmation is required'})
        if not email:
            raise serializers.ValidationError({'email': 'Email is required'})

        if password != password2:
            raise serializers.ValidationError({'password': 'Passwords must match'})
    
        if User.objects.filter(email=email).exists():
            raise serializers.ValidationError({'email': 'Email is already in use'})
    
        if User.objects.filter(username=username).exists():
            raise serializers.ValidationError({'username': 'Username is already in use'})
        
        return attrs

    def create(self, validated_data):
        validated_data.pop('password2')  # Remove password2 before creating the user
        user = User.objects.create_user(**validated_data)  # Use create_user to handle password hashing
        return user

class UpdateUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('username', 'email', 'avatar', 'default_language')
        extra_kwargs = {
            'username': {'required': False},
            'email': {'required': False},
            'avatar': {'required': False},
            'default_language': {'required': False}
        }

    def update(self, instance, validated_data):
        if 'email' in validated_data:
            instance.email = validated_data['email']
        if 'username' in validated_data:
            instance.username = validated_data['username']
        if 'avatar' in validated_data:
            instance.avatar = validated_data['avatar']
        if 'default_language' in validated_data:
            instance.default_language = validated_data['default_language']
        
        instance.save()
        return instance

from rest_framework import serializers
from .models import Match, User

class MatchSerializer(serializers.ModelSerializer):
    player1_username = serializers.SerializerMethodField()
    player2_username = serializers.SerializerMethodField()
    player3_username = serializers.SerializerMethodField()
    player4_username = serializers.SerializerMethodField()
    winner_username = serializers.SerializerMethodField()
    
    class Meta:
        model = Match
        fields = [
            'id', 'player1', 'player2', 'player3', 'player4',
            'player1_username', 'player2_username', 'player3_username', 'player4_username',
            'is_against_ai', 'ai_difficulty',
            'player1_score', 'player2_score', 'player3_score', 'player4_score',
            'winner', 'winner_username', 'is_player1_winner',
            'match_date', 'match_type'
        ]
        read_only_fields = ['id', 'match_date']
    
    def get_player1_username(self, obj):
        return obj.player1.username if obj.player1 else None
    
    def get_player2_username(self, obj):
        return obj.player2.username if obj.player2 else None
    
    def get_player3_username(self, obj):
        return obj.player3.username if obj.player3 else None
    
    def get_player4_username(self, obj):
        return obj.player4.username if obj.player4 else None
    
    def get_winner_username(self, obj):
        return obj.winner.username if obj.winner else None
    
    def validate(self, data):
        # Validar que el tipo de partido sea consistente con los jugadores proporcionados
        match_type = data.get('match_type')
        is_against_ai = data.get('is_against_ai', False)
        
        if is_against_ai:
            if not data.get('ai_difficulty'):
                raise serializers.ValidationError("Se requiere especificar la dificultad de la IA para partidos contra IA")
        
        elif match_type == 'local':
            if not data.get('player2'):
                raise serializers.ValidationError("Se requiere el jugador 2 para partidos 1v1")
        
        elif match_type == '3players':
            if not data.get('player2') or not data.get('player3'):
                raise serializers.ValidationError("Se requieren 3 jugadores para el modo de 3 jugadores")
        
        elif match_type == '4players':
            if not data.get('player2') or not data.get('player3') or not data.get('player4'):
                raise serializers.ValidationError("Se requieren 4 jugadores para el modo de 4 jugadores")
        
        return data