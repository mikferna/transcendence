FROM python:3.9

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Instalar cliente PostgreSQL y herramientas SSL
RUN apt-get update && apt-get install -y postgresql-client

WORKDIR /code
COPY requirements.txt /code/django/
COPY run.sh /code/django/

RUN pip install --upgrade pip
RUN pip install -r /code/django/requirements.txt
RUN pip install django-extensions Werkzeug pyOpenSSL
RUN pip install django-cors-headers

RUN chmod +x /code/django/run.sh

EXPOSE 8000

CMD ["sh", "/code/django/run.sh"]