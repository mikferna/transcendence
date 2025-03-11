from django.urls import path
from . import views

urlpatterns = [
    path('index/', views.index, name='index'),
    path('login/', views.login.as_view(), name="login"),
    path('register/', views.register.as_view(), name="register"),
    path('logout/', views.logout.as_view(), name="logout"),
    path('user_delete/', views.deleteProfile.as_view(), name="deleteProfile"),
    path('user_update/', views.updateProfile.as_view(), name="updateProfile"),
    path('validate_credentials/', views.validate_credentials, name='validate-credentials'),

    path('user/<str:username>/', views.userDetail.as_view(), name="userDetail"),
    path('users/', views.accountsList.as_view(), name='user_list'),
    path('block/<str:username>/', views.blockUser.as_view(), name='user_block'),
    path('unblock/<str:username>/', views.unblockUser.as_view(), name='user_unblock'),  # Fixed path
    path('block/list/', views.blockedUserList.as_view(), name='blocked_user_list'),  # Added trailing slash

    path('friend-requests/send/', views.sendFriendRequest.as_view(), name='send_friend_request'),
    path('friend-requests/accept/<int:request_id>/', views.acceptFriendRequest.as_view(), name='accept_friend_request'),  # Added request_id parameter
    path('friend-requests/decline/<int:request_id>/', views.declineFriendRequest.as_view(), name='decline_friend_request'),  # Added request_id parameter
    path('friend-requests/remove/', views.removeFriend.as_view(), name='remove_friend'),
    path('friends/<str:username>/list/', views.ListFriendsView, name='friend_list'),
    path('token/refresh/', views.AccountRefresh.as_view(), name='token_refresh'),  # Added missing URL
]