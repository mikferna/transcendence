#!/bin/bash

# Verificar directorio de certificados
CERT_DIR=$(dirname "$SSL_CERT_FILE")

# Verificar si los certificados existen, si no, crearlos
if [ ! -f "$SSL_CERT_FILE" ] || [ ! -f "$SSL_KEY_FILE" ]; then
    echo "Certificates not found, creating self-signed certificates..."
    mkdir -p "$CERT_DIR"
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout "$SSL_KEY_FILE" \
      -out "$SSL_CERT_FILE" \
      -subj "/C=ES/ST=Madrid/L=Madrid/O=42/CN=localhost"
    echo "Self-signed certificates created at $SSL_CERT_FILE and $SSL_KEY_FILE"
fi

# Generar environment.ts a partir de environment.template.ts
echo "Generando environment.ts con las variables de entorno..."
ENVIRONMENT_TEMPLATE="/usr/src/app/src/environments/environment.template.ts"
ENVIRONMENT_FILE="/usr/src/app/src/environments/environment.ts"

if [ -f "$ENVIRONMENT_TEMPLATE" ]; then
    echo "Usando valores para variables de entorno:"
    echo "API_URL: $API_URL"
    echo "FRONTEND_URL: $FRONTEND_URL"
    echo "PRODUCTION: $PRODUCTION"
    
    # Copiar la plantilla
    cp "$ENVIRONMENT_TEMPLATE" "$ENVIRONMENT_FILE"
    
    # Realizar sustituciones con sed
    sed -i "s|PRODUCTION_PLACEHOLDER|$PRODUCTION|g" "$ENVIRONMENT_FILE"
    sed -i "s|API_URL_PLACEHOLDER|$API_URL|g" "$ENVIRONMENT_FILE"
    sed -i "s|FRONTEND_URL_PLACEHOLDER|$FRONTEND_URL|g" "$ENVIRONMENT_FILE"
    sed -i "s|FT_CLIENT_ID_PLACEHOLDER|$FT_CLIENT_ID|g" "$ENVIRONMENT_FILE"
    sed -i "s|FT_REDIRECT_URI_PLACEHOLDER|$FT_REDIRECT_URI|g" "$ENVIRONMENT_FILE"
    
    echo "Environment file generado correctamente"
else
    echo "Error: No se encontró el archivo de plantilla $ENVIRONMENT_TEMPLATE"
    exit 1
fi

# Instalar dependencias
echo "Installing dependencies..."
npm install

# Iniciar el servidor de Angular con SSL
echo "Starting Angular server with HTTPS..."
ng serve --host 0.0.0.0 --port 4200 --ssl --ssl-key "$SSL_KEY_FILE" --ssl-cert "$SSL_CERT_FILE"