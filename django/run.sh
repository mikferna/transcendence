cd /code/django/
pip install --upgrade pip

python manage.py makemigrations
python manage.py migrate

python manage.py shell <<EOF
from django.contrib.auth import get_user_model

User = get_user_model()

if not User.objects.filter(username='admin').exists():
    User.objects.create_superuser('admin', 'admin@example.com', 'adminpassword')
EOF

# run server
python manage.py runserver 0.0.0.0:8000