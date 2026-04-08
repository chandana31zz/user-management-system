# 🚀 User Management System

A full-stack web application built using **Django REST Framework (backend)** and **React (frontend)**.  
The system manages users with **role-based access control** and secure authentication.

---

## 🔥 Features

- 🔐 JWT Authentication (Login & Logout)
- 👥 Role-Based Access (Admin, Manager, User)
- 📊 Dashboard with analytics
- 📁 File upload and download
- 🧾 Audit logs (track user actions)
- 🔁 Password reset functionality
- 👤 Profile management

---

## 🛠️ Tech Stack

### Backend
- Django
- Django REST Framework
- SQLite

### Frontend
- React
- Axios

---

## 🧠 How It Works

- React (frontend) sends API requests  
- Django (backend) processes the request  
- Database stores data  
- Response is sent back to React  

---

## 🔐 Roles & Access

| Role    | Access |
|---------|--------|
| Admin   | Full access (users, audit, analytics, files) |
| Manager | Limited access (users + dashboard) |
| User    | Basic access (profile, dashboard, files) |

---

## 🚀 How to Run the Project

1. Backend (Django)

```bash
python manage.py runserver

Backend runs on: http://127.0.0.1:8000/

2. Frontend (React)

cd frontend
npm install
npm start

Frontend runs on: http://localhost:3000/

🔗 API Example

http://127.0.0.1:8000/api/v1/auth/login/

📌 Project Structure
user-management-system/
│
├── core/        # Django settings
├── users/       # Main app (logic, APIs)
├── frontend/    # React UI
├── manage.py
└── README.md