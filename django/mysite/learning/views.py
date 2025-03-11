from django.shortcuts import render
from .models import User, FriendRequest
from rest_framework.generics import GenericAPIView, ListAPIView, UpdateAPIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .serializers import LoginSerializer, RegisterSerializer, UpdateUserSerializer
from django.contrib.auth import authenticate
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import api_view
from rest_framework import generics
from django.db import transaction
from django.db.models import Q
import logging

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

                return Response({
                    'refresh': str(refresh),
                    'access': access_token
                })
            else:
                return Response(
                    {'detail': 'Invalid credentials'},
                    status=status.HTTP_401_UNAUTHORIZED
                )
        
        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST
        )

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
                {'detail': 'User not found'},
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
            # Simply use the JWT token blacklist functionality
            refresh_token = request.data.get('refresh')
            token = RefreshToken(refresh_token)
            token.blacklist()
        except Exception as e:
            logger.error(f"Error in logout: {str(e)}")
            # Still return success as the user should be considered logged out
            
        return Response(
            {'detail': 'User logged out successfully'},
            status=status.HTTP_200_OK
        )

class deleteProfile(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        confirm = request.data.get('confirm')
        if confirm != 'yes':
            return Response(
                {'detail': 'Please confirm profile deletion by setting confirm=yes'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        user = request.user
        user.delete()

        return Response(
            {'detail': 'Profile deleted successfully'},
            status=status.HTTP_200_OK
        )

class updateProfile(UpdateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = UpdateUserSerializer

    def get_object(self):
        return self.request.user

    def update(self, request, *args, **kwargs):
        partial = True
        instance = self.get_object()

        data_to_update = {}
        if 'tournament_name' in request.data:
            data_to_update['tournament_name'] = request.data['tournament_name']
        if 'email' in request.data:
            data_to_update['email'] = request.data['email']
        if 'avatar' in request.FILES:
            data_to_update['avatar'] = request.FILES['avatar']

        serializer = self.get_serializer(instance, data=data_to_update, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        return Response(serializer.data)

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
                # Check for existing requests
                existing_request = FriendRequest.objects.filter(
                    Q(from_user=request.user, to_user=to_user) |
                    Q(from_user=to_user, to_user=request.user),
                    status='pending'
                ).first()

                if existing_request:
                    if existing_request.from_user == request.user:
                        return Response(
                            {'error': 'Friend request already sent'},
                            status=status.HTTP_400_BAD_REQUEST
                        )
                    else:
                        # Accept existing request
                        existing_request.status = 'accepted'
                        existing_request.save()
                        request.user.friends.add(to_user)
                        to_user.friends.add(request.user)
                        return Response(
                            {'message': 'Friend request accepted'},
                            status=status.HTTP_200_OK
                        )

                # Create new request
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
                {'detail': 'Friend ID is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        friend = User.objects.filter(id=friend_id).first()
        if not friend:
            return Response(
                {'detail': 'Friend not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Remove friendship in both directions
        request.user.friends.remove(friend)
        friend.friends.remove(request.user)

        return Response(
            {'detail': 'Friend removed successfully'},
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
                
                friend_request.status = 'declined'
                friend_request.save(update_fields=['status', 'updated_at'])
                
                logger.info(
                    f"Friend request {request_id} declined by {request.user.username}",
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
                    {'detail': 'You cannot block yourself'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Check if already blocked
            if request.user.blocked_users.filter(id=user_to_block.id).exists():
                return Response(
                    {'detail': 'User is already blocked'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Add to blocked users
            request.user.blocked_users.add(user_to_block)
            
            # Remove from friends if they were friends
            if request.user.friends.filter(id=user_to_block.id).exists():
                request.user.friends.remove(user_to_block)
                user_to_block.friends.remove(request.user)
            
            return Response(
                {'detail': 'User blocked successfully'},
                status=status.HTTP_200_OK
            )
        
        except User.DoesNotExist:
            return Response(
                {'detail': 'User not found'},
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
                    {'detail': 'User is not blocked'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Remove from blocked users
            request.user.blocked_users.remove(user_to_unblock)
            
            return Response(
                {'detail': 'User unblocked successfully'},
                status=status.HTTP_200_OK
            )
        
        except User.DoesNotExist:
            return Response(
                {'detail': 'User not found'},
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

@api_view(['POST'])
def validate_credentials(request):
    username = request.data.get('username')
    password = request.data.get('password')

    user = authenticate(username=username, password=password)

    if user is not None:
        return Response({'valid': True})
    else:
        return Response({'valid': False})