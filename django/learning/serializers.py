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
    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'password2']
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
        fields = ('email', 'tournament_name', 'avatar')
        extra_kwargs = {
            'email': {'required': False},
            'tournament_name': {'required': False},
            'avatar': {'required': False}
        }

    def validate_email(self, value):
        """
        Check that the email is unique
        """
        user = self.context['request'].user
        if User.objects.exclude(pk=user.pk).filter(email=value).exists():
            raise serializers.ValidationError("This email is already in use")
        return value

    def validate_tournament_name(self, value):
        """
        Check that the tournament_name is unique
        """
        user = self.context['request'].user
        if User.objects.exclude(pk=user.pk).filter(tournament_name=value).exists():
            raise serializers.ValidationError("This tournament name is already in use")
        return value

    def update(self, instance, validated_data):
        # Only update fields that were actually passed
        if 'email' in validated_data:
            instance.email = validated_data['email']
        if 'tournament_name' in validated_data:
            instance.tournament_name = validated_data['tournament_name']
        if 'avatar' in validated_data:
            instance.avatar = validated_data['avatar']
        
        instance.save()
        return instance

class MatchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Match
        fields = [
            'id', 'player1', 'player2', 'is_against_ai', 'ai_difficulty',
            'player1_score', 'player2_score', 'winner', 'is_player1_winner',
            'match_date', 'match_type'
        ]
        read_only_fields = ['id', 'match_date']