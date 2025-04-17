from django.urls import path, include
from . import views

urlpatterns = [
    # Rutas básicas
    path('index/', views.index, name='index'),
    
    # Autenticación y gestión de cuentas
    path('login/', views.login.as_view(), name="login"),
    path('register/', views.register.as_view(), name="register"),
    path('logout/', views.logout.as_view(), name="logout"),
    path('activate/', views.activateAccount.as_view(), name='activate_account'),
    path('token/refresh/', views.AccountRefresh.as_view(), name='token_refresh'),
    path('validate_credentials/', views.validate_credentials, name='validate-credentials'),

    # Autenticación contra la API de 42
   # path('auth/authorize/', Authorize42View.as_view(), name='authorize'),
    path('auth/authorize/', views.login42.as_view(), name='login42'),
    path('auth/callback/', views.FortyTwoCallbackView.as_view(), name='42_callback'),
    
    # Perfil de usuario
    path('user_delete/', views.deleteProfile.as_view(), name="deleteProfile"),
    path('user_update/', views.updateProfile.as_view(), name="updateProfile"),
    path('current-user/', views.currentUser.as_view(), name='current_user'),
    path('user/<str:username>/', views.userDetail.as_view(), name="userDetail"),
    path('users/', views.accountsList.as_view(), name='user_list'),
    path('users/search/', views.searchUsers.as_view(), name='search_users'),
    path('user/<str:username>/online-status/', views.UserOnlineStatus.as_view(), name='user-online-status'),

    # Amigos
    path('friends/<str:username>/list/', views.ListFriendsView, name='friend_list'),
    path('friend-requests/send/', views.sendFriendRequest.as_view(), name='send_friend_request'),
    path('friend-requests/list/', views.friendRequestList.as_view(), name='friend_request_list'),
    path('friend-requests/accept/<int:request_id>/', views.acceptFriendRequest.as_view(), name='accept_friend_request'),
    path('friend-requests/decline/<int:request_id>/', views.declineFriendRequest.as_view(), name='decline_friend_request'),
    path('friend-requests/remove/', views.removeFriend.as_view(), name='remove_friend'),
    path('friend-requests/status/<str:username>/', views.FriendRequestStatus.as_view(), name='friend_request_status'),
    
    # Bloqueos
    path('block/<str:username>/', views.blockUser.as_view(), name='user_block'),
    path('unblock/<str:username>/', views.unblockUser.as_view(), name='user_unblock'),
    path('block/list/', views.blockedUserList.as_view(), name='blocked_user_list'),
    
    # Partidas
    path('matches/history/<str:username>/', views.matchHistory.as_view(), name='match_history'),
    path('matches/create/', views.createMatch.as_view(), name='create_match'),
    path('test-connection/', views.test_connection, name='test_connection'),
]