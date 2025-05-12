# Usar la imagen oficial de Node.js como base
FROM node:20 AS build

# Establecer el directorio de trabajo dentro del contenedor
WORKDIR /usr/src/app

# Instalar Angular CLI globalmente
RUN npm install -g @angular/cli@17

# Copiar el código fuente de la aplicación Angular al contenedor
COPY ./pong-app /usr/src/app

# Instalar las dependencias de npm
WORKDIR /usr/src/app
RUN npm install

# Copiar los certificados SSL si existen o usar los auto-generados
COPY ./certs /app/certs

# Instalar OpenSSL para generar certificados si no existen
RUN apt-get update && apt-get install -y openssl

# Modificar el archivo angular.json para habilitar SSL
RUN node -e "const fs = require('fs'); const angularConfigPath = './angular.json'; \
    if (fs.existsSync(angularConfigPath)) { \
        const config = JSON.parse(fs.readFileSync(angularConfigPath)); \
        const projectName = Object.keys(config.projects)[0]; \
        if (!config.projects[projectName].architect.serve.options) config.projects[projectName].architect.serve.options = {}; \
        config.projects[projectName].architect.serve.options.ssl = true; \
        config.projects[projectName].architect.serve.options.sslKey = '/app/certs/key.pem'; \
        config.projects[projectName].architect.serve.options.sslCert = '/app/certs/cert.pem'; \
        fs.writeFileSync(angularConfigPath, JSON.stringify(config, null, 2)); \
    }"

# Exponer el puerto 4200 para servir la app Angular con HTTPS
EXPOSE 4200

# Copiar el archivo entrypoint.sh al contenedor
COPY ./entrypoint.sh /entrypoint.sh

# Darle permisos de ejecución al script entrypoint.sh
RUN chmod +x /entrypoint.sh

# Configurar el entrypoint para ejecutar el script entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]