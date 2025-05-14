#!/bin/bash
cd /code/django/

# Asegurarse de que los directorios de certificados existan
mkdir -p /code/certs

# Verificar si los certificados existen en la imagen, y si no, crear certificados auto-firmados
if [ ! -f "$SSL_CERT_FILE" ] || [ ! -f "$SSL_KEY_FILE" ]; then
    echo "Certificates not found, creating self-signed certificates..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout "$SSL_KEY_FILE" \
      -out "$SSL_CERT_FILE" \
      -subj "/C=ES/ST=Madrid/L=Madrid/O=42/CN=localhost"
    echo "Self-signed certificates created at $SSL_CERT_FILE and $SSL_KEY_FILE"
fi

pip install --upgrade pip

# Esperar a que PostgreSQL esté listo - usando variables de entorno
echo "Esperando a que PostgreSQL esté disponible..."
until PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DB -c '\q' 2>/dev/null; do
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

# Recopilar archivos estáticos
python manage.py collectstatic --no-input

# Iniciar servidor con Gunicorn en modo producción
echo "Iniciando servidor Django con HTTPS (Gunicorn en modo producción)..."
gunicorn mysite.wsgi:application \
    --bind=0.0.0.0:8000 \
    --workers=4 \
    --threads=2 \
    --certfile=$SSL_CERT_FILE \
    --keyfile=$SSL_KEY_FILE \
    --access-logfile=- \
    --error-logfile=- \
    --log-level=info