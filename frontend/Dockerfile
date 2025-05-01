# Usar la imagen oficial de Node.js como base
FROM node:20 AS build

# Establecer el directorio de trabajo dentro del contenedor
WORKDIR /usr/src/app/pong-app

# Instalar Angular CLI globalmente
RUN npm install -g @angular/cli@17

# Crear un nuevo proyecto Angular en el subdirectorio 'app'
RUN ng new app --defaults

# Moverse al directorio 'app' donde se creó el proyecto
WORKDIR /usr/src/app/pong-app/app

# Instalar las dependencias de npm
RUN npm install

# Instalar OpenSSL para generar certificados
RUN apt-get update && apt-get install -y openssl

# Generar certificados SSL auto-firmados
RUN openssl req -new -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

# Modificar el archivo angular.json para habilitar SSL
RUN node -e "const fs = require('fs'); const config = JSON.parse(fs.readFileSync('angular.json')); \
    if (!config.projects.app.architect.serve.options) config.projects.app.architect.serve.options = {}; \
    config.projects.app.architect.serve.options.ssl = true; \
    config.projects.app.architect.serve.options.sslKey = 'key.pem'; \
    config.projects.app.architect.serve.options.sslCert = 'cert.pem'; \
    fs.writeFileSync('angular.json', JSON.stringify(config, null, 2));"

# Exponer el puerto 4200 para servir la app Angular con HTTPS
EXPOSE 4200

# Copiar el archivo entrypoint.sh al contenedor
COPY ./entrypoint.sh /entrypoint.sh

# Darle permisos de ejecución al script entrypoint.sh
RUN chmod +x /entrypoint.sh

# Configurar el entrypoint para ejecutar el script entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]