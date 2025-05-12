FROM python:3.9

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV SSL_CERT_FILE=/code/certs/cert.pem
ENV SSL_KEY_FILE=/code/certs/key.pem

# Instalar cliente PostgreSQL y herramientas SSL
RUN apt-get update && apt-get install -y postgresql-client openssl

# Crear estructura de directorios
RUN mkdir -p /code/django /code/certs

WORKDIR /code/django

# Copiar los archivos de certificados si están disponibles durante la construcción
COPY . /code/django/

# Copiar el script de ejecución y los requerimientos
RUN chmod +x /code/django/run.sh

RUN pip install --upgrade pip
RUN pip install -r /code/django/requirements.txt
RUN pip install django-extensions Werkzeug pyOpenSSL
RUN pip install django-cors-headers

EXPOSE 8000

CMD ["sh", "/code/django/run.sh"]