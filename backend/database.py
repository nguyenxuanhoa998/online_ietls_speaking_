from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker

# NOTE: Replace 'root' and 'password' with your actual MySQL username and password.
SQLALCHEMY_DATABASE_URL = "mysql+pymysql://root:1@localhost/ieltsSpeaking"
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
