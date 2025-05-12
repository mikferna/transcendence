from django.conf import settings
from django.shortcuts import redirect
from django.shortcuts import render
from .models import *
from rest_framework.generics import GenericAPIView, ListAPIView, UpdateAPIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .serializers import *
from django.contrib.auth import authenticate
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import api_view, permission_classes
from rest_framework import generics
from django.db import transaction
from django.db.models import Q
import logging
import re
import requests

# Configure logging
logger = logging.getLogger(__name__)

def index(request):
    # Remove debug code - don't create users in a view function
    return render(request, 'index.html')

class login(GenericAPIView):
    permission_classes = [AllowAny]
    serializer_class = LoginSerializer
    
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        
        if serializer.is_valid():
            username = serializer.validated_data['username']
            password = serializer.validated_data['password']
            
            user = authenticate(username=username, password=password)
            if user:
                refresh = RefreshToken.for_user(user)
                access_token = str(refresh.access_token)
                user.is_online = True
                user.save()

                return Response({
                    'refresh': str(refresh),
                    'access': access_token,
                    'default_language': user.default_language  # Siempre devolver el idioma por defecto
                })
            else:
                return Response(
                    {'error': 'Invalid credentials'},
                    status=status.HTTP_401_UNAUTHORIZED
                )
        
        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST
        )

class login42(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        redirect_uri = settings.FT_REDIRECT_URI
    
        auth_url = (
            f"https://api.intra.42.fr/oauth/authorize"
            f"?client_id={settings.FT_CLIENT_ID}"
            f"&redirect_uri={redirect_uri}"
            f"&response_type=code"
        )
       
        return redirect(auth_url)

class FortyTwoCallbackView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        code = request.query_params.get('code')
        if not code:
            return redirect(f"{settings.FRONTEND_URL}/auth-error?error=missing_code")

        try:
            token_response = requests.post(
                'https://api.intra.42.fr/oauth/token',
                data={
                    'grant_type': 'authorization_code',
                    'client_id': settings.FT_CLIENT_ID,
                    'client_secret': settings.FT_CLIENT_SECRET,
                    'code': code,
                    'redirect_uri': settings.FT_REDIRECT_URI,
                },
                headers={'Content-Type': 'application/x-www-form-urlencoded'},
            )

            api_access_token = token_response.json().get('access_token')

            if token_response.status_code != 200:
                return redirect(f"{settings.FRONTEND_URL}/auth-error?error=token_exchange_failed")

            user_response = requests.get(
                'https://api.intra.42.fr/v2/me',
                headers={'Authorization': f'Bearer {api_access_token}'}
            )

            if user_response.status_code != 200:
                return redirect(f"{settings.FRONTEND_URL}/auth-error?error=user_info_failed")

            user_data = user_response.json()
            username_42 = f"[42]{user_data.get('login')}"
            email_42 = user_data.get('email')

            if not username_42 or not email_42:
                return redirect(f"{settings.FRONTEND_URL}/auth-error?error=invalid_user_data")

            try:
                user = User.objects.get(username=username_42)
            
            except User.DoesNotExist:

                # Generar contraseña simple
                import random
                import string

                def generate_password(length=6):
                    characters = string.ascii_letters + string.digits + "!@#$%^&*()"
                    password = ''.join(random.choice(characters) for i in range(length))
                    return password
                
                # Generar y guardar la contraseña antes del hash
                raw_password = generate_password()

                user = User.objects.create_user(
                    username=username_42,
                    email=email_42,
                    password=raw_password,
                )
                # Set initial values for new user
                user.is_active = True
                user.ft_user = True
                user.save()

            app_refresh_token = RefreshToken.for_user(user)
            app_access_token = str(app_refresh_token.access_token)
            user.is_online = True
            user.save()
            
            return redirect(
                f"{settings.FRONTEND_URL}/auth-success?access={app_access_token}&refresh={str(app_refresh_token)}&ft_token={api_access_token}"
            )
        
        except Exception as e:
            return redirect(f"{settings.FRONTEND_URL}/auth-error?error=internal_server_error")

class register(APIView):
    permission_classes = [AllowAny]
    serializer_class = RegisterSerializer

    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid(raise_exception=True):
            user = serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class userDetail(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request, username):
        user = User.objects.filter(username=username).first()

        if not user:
            return Response(
                {'error': 'User not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        avatar_url = user.avatar.url if user.avatar else None

        data = {
            "message": "User detail",
            "user": {
                "username": user.username,
                "email": user.email,
                "avatar": avatar_url,
                "is_online": user.is_online,
                "games_played": user.games_played,
                "games_won": user.games_won,
                "games_lost": user.games_lost,
            }
        }

        return Response(data, status=status.HTTP_200_OK)

class logout(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request):
        try:
            # Primero actualizamos el estado del usuario
            user = request.user
            user.is_online = False
            user.save()

            # Luego manejamos el token
            refresh_token = request.data.get('refresh')
            if refresh_token:
                token = RefreshToken(refresh_token)
                token.blacklist()
        except Exception as e:
            logger.error(f"Error in logout: {str(e)}")
            # Aún así consideramos que el usuario está desconectado
            
        return Response(
            {'message': 'User logged out successfully'},
            status=status.HTTP_200_OK
        )

class deleteProfile(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        confirm_username = request.data.get('confirm_username')
        if not confirm_username or confirm_username != request.user.username:
            return Response(
                {'error': 'Please confirm profile deletion by providing your exact username'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        user = request.user
        user.delete()

        return Response(
            {'message': 'Profile deleted successfully'},
            status=status.HTTP_200_OK
        )

# Cambiar de UpdateAPIView a APIView
class updateProfile(APIView):
    permission_classes = [IsAuthenticated]
    
    def patch(self, request):
        user = request.user
        data_to_update = {}
        
        # Validate username
        if 'username' in request.data:
            username = request.data['username']
            if username and len(username) > 30:
                return Response(
                    {'error': 'Username cannot exceed 30 characters'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Check if username is already taken by another user
            if username != user.username and User.objects.filter(username=username).exists():
                return Response(
                    {'error': 'This username is already taken'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            data_to_update['username'] = username
        
        # Validate email
        if 'email' in request.data:
            email = request.data['email']
            email_pattern = r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$'
            if email and not re.match(email_pattern, email):
                return Response(
                    {'error': 'Invalid email format'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Check if email is already taken by another user
            if email != user.email and User.objects.filter(email=email).exists():
                return Response(
                    {'error': 'This email is already registered'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            data_to_update['email'] = email

        # Validate language
        if 'default_language' in request.data:
            language = request.data['default_language']
            if language not in ['es', 'eus', 'en']:
                return Response(
                    {'error': 'Invalid language selection'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            data_to_update['default_language'] = language
    
        # Validate avatar size if present
        if 'avatar' in request.FILES:
            avatar = request.FILES['avatar']
            if avatar.size > 2 * 1024 * 1024:
                return Response(
                    {'error': 'Profile picture is too large. Maximum size is 2MB.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            data_to_update['avatar'] = avatar

        # Update user data
        for key, value in data_to_update.items():
            setattr(user, key, value)
        user.save()

        return Response({
            'message': 'Profile updated successfully',
            'data': {
                'username': user.username,
                'email': user.email,
                'avatar': user.avatar.url if user.avatar else None,
                'default_language': user.default_language
            }
        })

class acceptFriendRequest(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, request_id):
        try:
            with transaction.atomic():
                # Lock the request to prevent race conditions
                friend_request = FriendRequest.objects.select_for_update().get(
                    id=request_id,
                    to_user=request.user,
                    status='pending'
                )

                # Update request status
                friend_request.status = 'accepted'
                friend_request.save(update_fields=['status', 'updated_at'])

                # Establish bidirectional friendship
                request.user.friends.add(friend_request.from_user)
                friend_request.from_user.friends.add(request.user)

                logger.info(
                    f"Friend request {request_id} accepted by {request.user.username}",
                    extra={
                        'user': request.user.id,
                        'friend': friend_request.from_user.id,
                        'friend_request': request_id
                    }
                )

                return Response(
                    {
                        'message': 'Friend request accepted successfully',
                        'friend_id': friend_request.from_user.id
                    },
                    status=status.HTTP_200_OK
                )

        except FriendRequest.DoesNotExist:
            logger.warning(
                f"Friend request not found: {request_id}",
                extra={'user': request.user.id}
            )
            return Response(
                {'error': 'Friend request not found or already processed'},
                status=status.HTTP_404_NOT_FOUND
            )

        except Exception as e:
            logger.error(
                f"Error accepting friend request: {str(e)}",
                exc_info=True,
                extra={'user': request.user.id, 'friend_request': request_id}
            )
            return Response(
                {'error': 'Could not process friend request'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class sendFriendRequest(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            to_username = request.data.get('to_username')
            if not to_username:
                return Response(
                    {'error': 'Username is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            try:
                to_user = User.objects.get(username=to_username)
            except User.DoesNotExist:
                return Response(
                    {'error': 'User not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

            if request.user == to_user:
                return Response(
                    {'error': 'Cannot send friend request to yourself'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Check if user is blocked
            if request.user.blocked_users.filter(id=to_user.id).exists() or to_user.blocked_users.filter(id=request.user.id).exists():
                return Response(
                    {'error': 'Cannot send friend request to blocked user'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Check existing friendship
            if request.user.friends.filter(id=to_user.id).exists():
                return Response(
                    {'error': 'Already friends'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            with transaction.atomic():
                # Check for existing requests regardless of status
                existing_request = FriendRequest.objects.filter(
                    Q(from_user=request.user, to_user=to_user) |
                    Q(from_user=to_user, to_user=request.user)
                ).first()

                if existing_request:
                    if existing_request.from_user == request.user:
                        if existing_request.status == 'pending':
                            return Response(
                                {'error': 'Friend request already sent'},
                                status=status.HTTP_400_BAD_REQUEST
                            )
                        elif existing_request.status == 'declined':
                            # Reactivate the declined request
                            existing_request.status = 'pending'
                            existing_request.save(update_fields=['status', 'updated_at'])
                            return Response(
                                {'message': 'Friend request sent successfully'},
                                status=status.HTTP_201_CREATED
                            )
                    else:
                        # Accept existing request if it's from the other user
                        if existing_request.status == 'pending':
                            existing_request.status = 'accepted'
                            existing_request.save()
                            request.user.friends.add(to_user)
                            to_user.friends.add(request.user)
                            return Response(
                                {'message': 'Friend request accepted'},
                                status=status.HTTP_200_OK
                            )
                        elif existing_request.status == 'declined':
                            # Create a new request since the other direction was declined
                            FriendRequest.objects.create(
                                from_user=request.user,
                                to_user=to_user,
                                status='pending'
                            )
                            return Response(
                                {'message': 'Friend request sent successfully'},
                                status=status.HTTP_201_CREATED
                            )

                # Create new request if none exists
                FriendRequest.objects.create(
                    from_user=request.user,
                    to_user=to_user,
                    status='pending'
                )

            return Response(
                {'message': 'Friend request sent successfully'},
                status=status.HTTP_201_CREATED
            )

        except Exception as e:
            logger.error(f"Error in SendFriendRequestView: {str(e)}", exc_info=True)
            return Response(
                {'error': 'An error occurred while processing your request'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class removeFriend(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        friend_id = request.data.get('friend_id')
        if not friend_id:
            return Response(
                {'error': 'Friend ID is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        friend = User.objects.filter(id=friend_id).first()
        if not friend:
            return Response(
                {'error': 'Friend not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Remove friendship in both directions
        request.user.friends.remove(friend)
        friend.friends.remove(request.user)
        
        # Eliminar cualquier solicitud de amistad existente entre estos usuarios
        FriendRequest.objects.filter(
            Q(from_user=request.user, to_user=friend) | 
            Q(from_user=friend, to_user=request.user)
        ).delete()

        return Response(
            {'message': 'Friend removed successfully'},
            status=status.HTTP_200_OK
        )

class declineFriendRequest(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, request_id):
        try:
            with transaction.atomic():
                # Lock the record to prevent race conditions
                friend_request = FriendRequest.objects.select_for_update().get(
                    id=request_id,
                    to_user=request.user,
                    status='pending'
                )
                
                # En lugar de cambiar el estado, eliminamos la solicitud completamente
                friend_request.delete()
                
                logger.info(
                    f"Friend request {request_id} declined and deleted by {request.user.username}",
                    extra={'user': request.user.id, 'friend_request': request_id}
                )
                
                return Response(
                    {'message': 'Friend request declined successfully'},
                    status=status.HTTP_200_OK
                )

        except FriendRequest.DoesNotExist:
            logger.warning(
                f"Friend request not found: {request_id}",
                extra={'user': request.user.id}
            )
            return Response(
                {'error': 'Friend request not found or already processed'},
                status=status.HTTP_404_NOT_FOUND
            )
            
        except Exception as e:
            logger.error(
                f"Error declining friend request: {str(e)}",
                exc_info=True,
                extra={'user': request.user.id, 'friend_request': request_id}
            )
            return Response(
                {'error': 'Could not process request'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

@api_view(['GET'])
def ListFriendsView(request, username):
    try:
        user = User.objects.get(username=username)
        friends = user.friends.all()
        friend_data = [{
            'id': friend.id,
            'username': friend.username,
            'is_online': friend.is_online,
        } for friend in friends]
        return Response(friend_data)

    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

class blockUser(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request, username):
        try:
            # Get the user to block
            user_to_block = User.objects.get(username=username)
            
            if user_to_block == request.user:
                return Response(
                    {'error': 'You cannot block yourself'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Check if already blocked
            if request.user.blocked_users.filter(id=user_to_block.id).exists():
                return Response(
                    {'error': 'User is already blocked'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Add to blocked users
            request.user.blocked_users.add(user_to_block)
            
            # Remove from friends if they were friends
            if request.user.friends.filter(id=user_to_block.id).exists():
                request.user.friends.remove(user_to_block)
                user_to_block.friends.remove(request.user)
            
            return Response(
                {'message': 'User blocked successfully'},
                status=status.HTTP_200_OK
            )
        
        except User.DoesNotExist:
            return Response(
                {'error': 'User not found'},
                status=status.HTTP_404_NOT_FOUND
            )

class blockedUserList(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        blocked_users = request.user.blocked_users.all()
        data = {
            "message": "Blocked users list",
            "blocked_users": []
        }

        for user in blocked_users:
            data["blocked_users"].append({
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "avatar": user.avatar.url if user.avatar else None,
                "is_online": user.is_online,
                "games_played": user.games_played,
                "games_won": user.games_won,
                "games_lost": user.games_lost,
            })

        return Response(data, status=status.HTTP_200_OK)

class unblockUser(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request, username):
        try:
            # Get the user to unblock
            user_to_unblock = User.objects.get(username=username)
            
            # Check if they're actually blocked
            if not request.user.blocked_users.filter(id=user_to_unblock.id).exists():
                return Response(
                    {'error': 'User is not blocked'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Remove from blocked users
            request.user.blocked_users.remove(user_to_unblock)
            
            return Response(
                {'message': 'User unblocked successfully'},
                status=status.HTTP_200_OK
            )
        
        except User.DoesNotExist:
            return Response(
                {'error': 'User not found'},
                status=status.HTTP_404_NOT_FOUND
            )

class accountsList(generics.ListAPIView):
    permission_classes = [AllowAny]
    queryset = User.objects.all()
    serializer_class = RegisterSerializer

class AccountRefresh(TokenRefreshView):
    def post(self, request, *args, **kwargs):
        refresh_token = request.data.get('refresh')

        if not refresh_token:
            return Response(
                {'error': 'Refresh token is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # Validate the refresh token
            token = RefreshToken(refresh_token)
            
            # Generate new access token
            new_access_token = str(token.access_token)

            return Response(
                {'access': new_access_token},
                status=status.HTTP_200_OK
            )

        except TokenError as e:
            return Response(
                {'error': 'Invalid or expired refresh token'},
                status=status.HTTP_401_UNAUTHORIZED
            )

class UserOnlineStatus(APIView):
    permission_classes = [AllowAny]

    def get(self, request, username):
        try:
            user = User.objects.get(username=username)

            return Response({
                'username': user.username,
                'is_online': user.is_online
            }, status=status.HTTP_200_OK)

        except User.DoesNotExist:
            return Response(
                {'error': f'Usuario "{username}" no encontrado'},
                status=status.HTTP_404_NOT_FOUND
            )

@api_view(['POST'])
def validate_credentials(request):
    username = request.data.get('username')
    password = request.data.get('password')

    user = authenticate(username=username, password=password)

    if user is not None:
        return Response({'valid': True})
    else:
        return Response({'valid': False})

class activateAccount(APIView):
    permission_classes = [AllowAny]
    
    def get(self, request):
        token = request.query_params.get('token')
        
        if not token:
            return Response(
                {'error': 'Activation token is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        try:
            user = AccountActivateToken.objects.activate_user_by_token(token)
            
            if user:
                # Delete token after successful activation
                AccountActivateToken.objects.filter(user=user).delete()
                
                return Response(
                    {'message': 'Account activated successfully'},
                    status=status.HTTP_200_OK
                )
            else:
                return Response(
                    {'error': 'Invalid or expired token'},
                    status=status.HTTP_400_BAD_REQUEST
                )
                
        except Exception as e:
            logger.error(f"Error activating account: {str(e)}", exc_info=True)
            return Response(
                {'error': 'Failed to activate account'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class matchHistory(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request, username):
        try:
            user = User.objects.get(username=username)
            matches = Match.objects.filter(
                Q(player1=user) | Q(player2=user) | Q(player3=user) | Q(player4=user)
            ).select_related('player1', 'player2', 'player3', 'player4', 'winner')
            
            serializer = MatchSerializer(matches, many=True)
            
            return Response(
                {
                    'message': 'Match history retrieved successfully',
                    'matches': serializer.data
                },
                status=status.HTTP_200_OK
            )
            
        except User.DoesNotExist:
            return Response(
                {'error': 'User not found'},
                status=status.HTTP_404_NOT_FOUND
            )

class createMatch(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        try:
            data = request.data
            is_against_ai = data.get('is_against_ai', False)
            match_type = data.get('match_type', 'local')
            tournament_round = data.get('tournament_round')
            is_tournament = match_type == 'tournament' or tournament_round is not None
            
            logger.info(f"TORNEO - Creando partida: {match_type}, Round: {tournament_round}, AI: {is_against_ai}, Datos: {data}")
            
            # Configuración básica del partido
            match_data = {
                'player1_score': data.get('player1_score', 0),
                'player2_score': data.get('player2_score', 0),
                'is_against_ai': is_against_ai,
                'match_type': match_type,
            }
            
            # Para torneos, buscar player1 por username
            if is_tournament:
                player1_username = data.get('player1_username')
                if not player1_username:
                    return Response(
                        {'error': 'Player 1 username is required for tournament matches'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                
                try:
                    player1 = User.objects.get(username=player1_username)
                    match_data['player1'] = player1.id
                except User.DoesNotExist:
                    return Response(
                        {'error': f'Player 1 "{player1_username}" not found'},
                        status=status.HTTP_404_NOT_FOUND
                    )
                    
                # Guardar información específica del torneo
                if tournament_round:
                    match_data['tournament_round'] = tournament_round
            else:
                # Para partidas normales, player1 es el usuario actual
                match_data['player1'] = request.user.id
            
            # Añadir puntajes de jugadores 3 y 4 si están presentes
            if data.get('player3_score') is not None:
                match_data['player3_score'] = data.get('player3_score', 0)
            
            if data.get('player4_score') is not None:
                match_data['player4_score'] = data.get('player4_score', 0)
            
            # Handle AI match
            if is_against_ai:
                match_data['ai_difficulty'] = data.get('ai_difficulty', 'easy')
                match_data['is_player1_winner'] = data.get('is_player1_winner', False)
                if match_data['is_player1_winner']:
                    match_data['winner'] = request.user.id
            
            # Handle multiplayer matches (including tournaments)
            else:
                # Para partidas con múltiples jugadores, necesitamos sus usernames
                if match_type in ['local', '3players', '4players'] or is_tournament:
                    # Player 2 es obligatorio para todos los modos multijugador
                    player2_username = data.get('player2_username')
                    if not player2_username:
                        return Response(
                            {'error': 'Player 2 username is required for multiplayer matches'},
                            status=status.HTTP_400_BAD_REQUEST
                        )
                    
                    try:
                        player2 = User.objects.get(username=player2_username)
                        match_data['player2'] = player2.id
                    except User.DoesNotExist:
                        return Response(
                            {'error': f'Player 2 "{player2_username}" not found'},
                            status=status.HTTP_404_NOT_FOUND
                        )
                
                # Player 3 para los modos de 3 y 4 jugadores
                if match_type in ['3players', '4players']:
                    player3_username = data.get('player3_username')
                    if not player3_username:
                        return Response(
                            {'error': 'Player 3 username is required for 3 or 4 player matches'},
                            status=status.HTTP_400_BAD_REQUEST
                        )
                    
                    try:
                        player3 = User.objects.get(username=player3_username)
                        match_data['player3'] = player3.id
                    except User.DoesNotExist:
                        return Response(
                            {'error': f'Player 3 "{player3_username}" not found'},
                            status=status.HTTP_404_NOT_FOUND
                        )
                
                # Player 4 solo para el modo de 4 jugadores
                if match_type == '4players':
                    player4_username = data.get('player4_username')
                    if not player4_username:
                        return Response(
                            {'error': 'Player 4 username is required for 4 player matches'},
                            status=status.HTTP_400_BAD_REQUEST
                        )
                    
                    try:
                        player4 = User.objects.get(username=player4_username)
                        match_data['player4'] = player4.id
                    except User.DoesNotExist:
                        return Response(
                            {'error': f'Player 4 "{player4_username}" not found'},
                            status=status.HTTP_404_NOT_FOUND
                        )
                
                # Set winner based on username
                winner_username = data.get('winner_username')
                if winner_username:
                    winner_username = winner_username.strip()
                    logger.info(f"TORNEO - Verificando ganador: {winner_username}")
                    
                    # Lógica específica para torneos
                    if is_tournament:
                        player1_username = data.get('player1_username')
                        player2_username = data.get('player2_username')
                        
                        if winner_username == player1_username:
                            match_data['winner'] = match_data['player1']
                            logger.info(f"TORNEO - Ganador es player1: {player1_username}")
                        elif winner_username == player2_username and match_data.get('player2'):
                            match_data['winner'] = match_data['player2']
                            logger.info(f"TORNEO - Ganador es player2: {player2_username}")
                        else:
                            logger.error(f"TORNEO - Error de ganador: {winner_username} no es {player1_username} ni {player2_username}")
                            return Response(
                                {'error': f'Winner "{winner_username}" must be one of the players: {player1_username} or {player2_username}'},
                                status=status.HTTP_400_BAD_REQUEST
                            )
                    else:
                        # Lógica original para partidas no-torneo
                        if winner_username == request.user.username:
                            match_data['winner'] = request.user.id
                            if match_type == 'local':
                                match_data['is_player1_winner'] = True
                        elif match_data.get('player2') and winner_username == player2_username:
                            match_data['winner'] = player2.id
                            if match_type == 'local':
                                match_data['is_player1_winner'] = False
                        elif match_type in ['3players', '4players'] and match_data.get('player3') and winner_username == player3_username:
                            match_data['winner'] = player3.id
                        elif match_type == '4players' and match_data.get('player4') and winner_username == player4_username:
                            match_data['winner'] = player4.id
                        else:
                            return Response(
                                {'error': 'Winner must be one of the players'},
                                status=status.HTTP_400_BAD_REQUEST
                            )
            
            logger.info(f"TORNEO - Datos finales para crear partida: {match_data}")
            
            # Validate and save
            serializer = MatchSerializer(data=match_data)
            if serializer.is_valid():
                match = serializer.save()
                return Response(
                    {
                        'message': 'Match created successfully',
                        'match': serializer.data
                    },
                    status=status.HTTP_201_CREATED
                )
            else:
                logger.error(f"TORNEO - Error de validación: {serializer.errors}")
                return Response(
                    serializer.errors,
                    status=status.HTTP_400_BAD_REQUEST
                )
                
        except Exception as e:
            logger.error(f"Error creating match: {str(e)}", exc_info=True)
            return Response(
                {'error': 'Failed to create match'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class currentUser(APIView):
    def get(self, request):
        user = request.user
        return Response({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'avatar': user.avatar.url if user.avatar else None,
            'tournament_name': user.tournament_name,
            'is_online': user.is_online,
            'games_played': user.games_played,
            'games_won': user.games_won,
            'games_lost': user.games_lost,
            'default_language': user.default_language,
            'ft_user' : user.ft_user,
        }, status=status.HTTP_200_OK)

class searchUsers(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        query = request.query_params.get('query', '')
        
        if not query:
            return Response(
                {'error': 'Search query is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        users = User.objects.filter(
            username__icontains=query
        ).exclude(
            id=request.user.id
        )[:10]
        
        user_data = []
        for user in users:
            # Verificar si es amigo
            is_friend = request.user.friends.filter(id=user.id).exists()
            
            # Verificar si está bloqueado
            is_blocked = request.user.blocked_users.filter(id=user.id).exists()
            
            # Verificar si hay una solicitud de amistad pendiente
            has_pending_request = FriendRequest.objects.filter(
                (Q(from_user=request.user, to_user=user) | Q(from_user=user, to_user=request.user)),
                status='pending'
            ).exists()
            
            user_data.append({
                'id': user.id,
                'username': user.username,
                'avatar': user.avatar.url if user.avatar else None,
                'is_online': user.is_online,
                'is_friend': is_friend,
                'is_blocked': is_blocked,
                'has_pending_request': has_pending_request
            })
        
        return Response(user_data, status=status.HTTP_200_OK)

class friendRequestList(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        pending_requests = FriendRequest.objects.filter(
            to_user=request.user,
            status='pending'
        ).select_related('from_user')
        
        request_data = [{
            'id': req.id,
            'from_user': {
                'id': req.from_user.id,
                'username': req.from_user.username,
                'avatar': req.from_user.avatar.url if req.from_user.avatar else None,
                'is_online': req.from_user.is_online,
            },
            'created_at': req.created_at,
        } for req in pending_requests]
        
        return Response(request_data, status=status.HTTP_200_OK)

@api_view(['GET'])
@permission_classes([AllowAny])
def test_connection(request):
    return Response({
        'message': 'Conexión exitosa con Django!',
        'status': 'success'
    }, status=status.HTTP_200_OK)

class FriendRequestStatus(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request, username):
        try:
            target_user = User.objects.get(username=username)
            
            # Verificar si son amigos
            is_friend = request.user.friends.filter(id=target_user.id).exists()
            
            # Verificar si hay solicitud pendiente
            has_pending_request = FriendRequest.objects.filter(
                (Q(from_user=request.user, to_user=target_user) | 
                 Q(from_user=target_user, to_user=request.user)),
                status='pending'
            ).exists()
            
            return Response({
                'is_friend': is_friend,
                'has_pending_request': has_pending_request
            }, status=status.HTTP_200_OK)
            
        except User.DoesNotExist:
            return Response(
                {'error': 'Usuario no encontrado'},
                status=status.HTTP_404_NOT_FOUND
            )
