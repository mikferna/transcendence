#!/bin/bash
cd /code/django/
pip install --upgrade pip

# Esperar a que PostgreSQL esté listo
echo "Esperando a que PostgreSQL esté disponible..."
until PGPASSWORD=postgres psql -h postgres -U postgres -d elephant -c '\q' 2>/dev/null; do
  echo "PostgreSQL no disponible todavía - esperando..."
  sleep 3
done
echo "PostgreSQL disponible - continuando..."

# Migraciones
python manage.py makemigrations
python manage.py migrate

# Crear superusuario si no existe
python manage.py shell <<EOF
from django.contrib.auth import get_user_model

User = get_user_model()

if not User.objects.filter(username='admin').exists():
    User.objects.create_superuser('admin', 'admin@example.com', 'adminpassword')
EOF

# Ejecutar servidor con HTTPS
echo "Iniciando servidor Django con HTTPS..."
python manage.py runserver_plus --cert-file=/code/certs/cert.pem --key-file=/code/certs/key.pem 0.0.0.0:8000