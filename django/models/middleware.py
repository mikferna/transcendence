import time
from datetime import datetime, timedelta, timezone
from django.conf import settings
from django.contrib.sessions.backends.base import UpdateError
from django.utils.cache import patch_vary_headers
from django.contrib.sessions.middleware import SessionMiddleware
from rest_framework_simplejwt.tokens import AccessToken
import logging

logger = logging.getLogger(__name__)

class EnhancedSessionMiddleware(SessionMiddleware):
    """
    Middleware that integrates Django's session system with JWT authentication.
    
    This middleware extends Django's SessionMiddleware to use JWT tokens as
    session identifiers, providing better security and interoperability with
    modern authentication patterns.
    """
    
    def process_request(self, request):
        """
        Process the incoming request and set up the session.
        
        Extracts the authorization token from cookies, validates it,
        and initializes the session object.
        """
        auth_token = request.COOKIES.get(settings.SESSION_COOKIE_NAME)
        session_key = None
        
        if auth_token:
            try:
                # Attempt to decode the token to extract session information
                token_data = AccessToken(auth_token)
                session_key = token_data.get("session_key")
                
                # Add user information to request if not already present
                if not hasattr(request, 'user') or request.user.is_anonymous:
                    user_id = token_data.get("user_id")
                    if user_id:
                        from django.contrib.auth import get_user_model
                        User = get_user_model()
                        try:
                            request.user = User.objects.get(id=user_id)
                        except User.DoesNotExist:
                            pass
            except Exception as e:
                # Log the error but continue with a new session
                logger.debug(f"Token validation error: {str(e)}")
                
        # Initialize the session with the extracted key or create a new one
        request.session = self.SessionStore(session_key)

    def process_response(self, request, response):
        """
        Process the outgoing response and handle session persistence.
        
        Updates the session if needed and sets the appropriate cookies.
        """
        # Check if session was accessed or modified during the request
        try:
            accessed = request.session.accessed
            modified = request.session.modified
            empty = request.session.is_empty()
        except AttributeError:
            return response
            
        # Delete session cookie if session is empty
        if settings.SESSION_COOKIE_NAME in request.COOKIES and empty:
            response.delete_cookie(
                settings.SESSION_COOKIE_NAME,
                path=settings.SESSION_COOKIE_PATH,
                domain=settings.SESSION_COOKIE_DOMAIN,
                samesite=settings.SESSION_COOKIE_SAMESITE,
            )
            patch_vary_headers(response, ("Cookie",))
        else:
            if accessed:
                patch_vary_headers(response, ("Cookie",))
                
            # Save session and update cookie if modified
            if (modified or settings.SESSION_SAVE_EVERY_REQUEST) and not empty:
                # Determine expiration settings
                if request.session.get_expire_at_browser_close():
                    max_age = None
                    expires = None
                else:
                    max_age = request.session.get_expiry_age()
                    expires_time = time.time() + max_age
                    expires = datetime.fromtimestamp(expires_time, tz=timezone.utc)
                
                # Save session if request was successful
                if response.status_code < 500:
                    try:
                        request.session.save()
                    except UpdateError:
                        logger.error("Session was deleted before request completed")
                        return response
                    
                    # Only proceed if user is authenticated
                    if hasattr(request, 'user') and request.user.is_authenticated:
                        # Create token with session information
                        auth_token = AccessToken.for_user(request.user)
                        
                        # Set session expiry (4 hours)
                        token_lifetime = getattr(settings, 'SESSION_TOKEN_LIFETIME', 14400)
                        auth_token.set_exp(lifetime=timedelta(seconds=token_lifetime))
                        
                        # Add session key to token
                        auth_token["session_key"] = request.session.session_key
                        
                        # Set the cookie in the response
                        response.set_cookie(
                            settings.SESSION_COOKIE_NAME,
                            str(auth_token),
                            max_age=max_age,         # <-- Mantener este
                            # expires=expires,       # <-- Eliminar o comentar esta línea
                            domain=settings.SESSION_COOKIE_DOMAIN,
                            path=settings.SESSION_COOKIE_PATH,
                            secure=settings.SESSION_COOKIE_SECURE or None,
                            httponly=settings.SESSION_COOKIE_HTTPONLY or None,
                            samesite=settings.SESSION_COOKIE_SAMESITE,
                        )
        
        return response