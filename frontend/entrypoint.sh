#!/bin/bash

# Verificar si los certificados existen, si no, crearlos
if [ ! -f "/app/certs/cert.pem" ] || [ ! -f "/app/certs/key.pem" ]; then
    echo "Certificates not found, creating self-signed certificates..."
    mkdir -p /app/certs
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout "/app/certs/key.pem" \
      -out "/app/certs/cert.pem" \
      -subj "/C=ES/ST=Madrid/L=Madrid/O=42/CN=localhost"
    echo "Self-signed certificates created"
fi

# Instalar dependencias
echo "Installing dependencies..."
npm install

# Iniciar el servidor de Angular con SSL
echo "Starting Angular server with HTTPS..."
ng serve --host 0.0.0.0 --port 4200 --ssl --ssl-key /app/certs/key.pem --ssl-cert /app/certs/cert.pem
