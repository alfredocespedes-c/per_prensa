"""Sesión síncrona de SQLAlchemy (psycopg2). Ver plan: <20 lectores internos, sin
necesidad de asyncpg; pool conservador porque <HOST_BD> es un servidor compartido
que no administramos nosotros.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from ..config import DATABASE_URL

engine = create_engine(
    DATABASE_URL,
    pool_size=5,
    max_overflow=5,
    pool_pre_ping=True,
    connect_args={
        "connect_timeout": 10,
        "gssencmode": "disable",
        "sslmode": "disable",
        # statement_timeout: aborta a nivel servidor cualquier consulta > 15 s (SEC-02),
        # evitando que una petición patológica al histórico agote el pool de 10 conexiones
        # contra la BD compartida y bloquee /api/noticias.
        "options": "-c statement_timeout=15000",
    },
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
