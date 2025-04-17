FROM python:3.9

ENV PYTHONDONTWRITEBYTECODE=1

ENV PYTHONUNBUFFERED=1

WORKDIR /code
COPY requirements.txt /code/django/
COPY run.sh /code/django/

RUN pip install --upgrade pip
RUN pip install -r /code/django/requirements.txt

RUN chmod +x /code/django/run.sh

EXPOSE 8000

CMD ["sh", "/code/django/run.sh"]