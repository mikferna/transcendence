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

# Exponer el puerto 4200 para servir la app Angular
EXPOSE 4200

# Copiar el archivo entrypoint.sh al contenedor
COPY ./entrypoint.sh /entrypoint.sh

# Darle permisos de ejecución al script entrypoint.sh
RUN chmod +x /entrypoint.sh

# Configurar el entrypoint para ejecutar el script entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
