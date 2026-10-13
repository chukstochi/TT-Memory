# TT Memory — Starter Backend

Backend foundation for TT Memory using FastAPI, MySQL, and Cloudflare R2.

## 1. Requirements
- Python 3.11+
- MySQL 8+
- Cloudflare R2 bucket and S3 API credentials (needed for uploads)

## 2. Setup
```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
```

Edit `.env` with your MySQL and R2 details.

Create a MySQL database and user:
```sql
CREATE DATABASE tt_memory CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'ttmemory'@'localhost' IDENTIFIED BY 'change_this_password';
GRANT ALL PRIVILEGES ON tt_memory.* TO 'ttmemory'@'localhost';
FLUSH PRIVILEGES;
```

Run the API:
```bash
uvicorn app.main:app --reload
```
Open http://127.0.0.1:8000/docs

The app creates its initial tables on startup for this starter. For production, add Alembic migrations before launch.

## 3. First endpoints
- `GET /health`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/users/me`
- `POST /api/v1/uploads/presign`
- `POST /api/v1/memories`
- `GET /api/v1/memories`

## 4. Media upload flow
1. App asks the API for a presigned upload URL.
2. Mobile app uploads the file directly to R2.
3. App calls `POST /api/v1/memories` to save the file metadata in MySQL.

Actual photos/videos/audio live in R2, not MySQL.

## Important
This is a development starter, not a production-ready financial/medical-grade archive. Before launch, add email/phone verification, password reset, rate limiting, malware/content checks, robust authorization tests, backups, audit logs, and database migrations.
