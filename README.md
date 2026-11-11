# SMMS School Management System

SMMS includes an admissions workspace, a React frontend, a .NET API, and a PostgreSQL database. Follow the numbered steps below after cloning the repository.

## Screenshots

| Role selection | Guardian overview |
|---|---|
| <img src="helping-images/1.png" alt="Role selection screen" width="480"> | <img src="helping-images/2.png" alt="Guardian overview" width="480"> |

| Guardian class list | Guardian application |
|---|---|
| <img src="helping-images/3.png" alt="Guardian class list" width="480"> | <img src="helping-images/4.png" alt="Guardian application form" width="480"> |

| Guardian applications | Admin overview |
|---|---|
| <img src="helping-images/5.png" alt="Guardian applications" width="480"> | <img src="helping-images/admin%201.png" alt="Admin overview" width="480"> |

| Admin class management | Admin classes |
|---|---|
| <img src="helping-images/admin%202.png" alt="Admin class management" width="480"> | <img src="helping-images/admin%203.png" alt="Admin classes" width="480"> |

## Installation and Startup

1. **Install the prerequisites:** Install Git and Docker Desktop with Docker Compose, then start Docker Desktop. For running the source code outside Docker, also install Node.js/npm, the .NET 11 SDK, and PostgreSQL.

2. **Clone the repository and open the project folder:**

   ```bash
   git clone <repository-url>
   cd sms
   ```

3. **Build and start the complete application with Docker:** Run this command from the `sms` folder:

   ```bash
   docker compose up --build
   ```

   The first build may take a few minutes while Docker downloads dependencies and creates the images. Compose starts PostgreSQL, the backend API, and the frontend. A `.env` file is not required for the default local setup.

4. **Open the application:**

   - Frontend: <http://localhost:5173>
   - Backend API: <http://localhost:8080>

5. **Stop the application:** Press `Ctrl+C` in the terminal running Compose. You can then run:

   ```bash
   docker compose down
   ```

   Database data is stored in the `postgres_data` named volume and persists when containers stop. To delete the database data as well, run `docker compose down -v`. This permanently removes all data in that volume.

## Local Development

6. **Create the environment configuration:** Copy `.env.example` to `.env` in the repository root and set `DATABASE_URL` to your PostgreSQL connection string. For example:

   ```env
   DATABASE_URL=postgresql://sms:sms_local_password@localhost:5432/sms?sslmode=disable
   HOLD_DURATION_SECONDS=600
   BACKEND_API_URL=http://localhost:8080
   ```

   The `.env` file is not tracked by Git. For a hosted database such as Neon, use the connection URL and SSL mode provided by your database provider.

7. **Start the backend** from the repository root:

   ```powershell
   dotnet run --project .\backend\backend.csproj --launch-profile http
   ```

   On startup, pending SQL migrations are applied to the database automatically.

8. **Install frontend dependencies and start the development server** in a separate terminal:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

   Vite prints the frontend URL in the terminal. From the `frontend` folder, run `npm run build` to create a production build or `npm run lint` to lint the code.

## Implemented Features

1. **Admissions workspace UI:** The overview provides shortcuts to create classes, browse classes and seat availability, and view student applications.
2. **Class management:** Create classes, view seat counts, and soft-delete classes. Deletion is blocked while a class has active applications.
3. **Student applications:** Use a 17-digit student ID to hold a seat, check hold status, confirm an application, or cancel it. The student ID is saved in browser local storage.
4. **Seat hold expiry:** The default hold duration is 600 seconds. A background service and API requests both expire holds whose time has elapsed.
5. **Admissions API:** Endpoints support listing, creating, viewing, and deleting classes; creating and checking holds; confirming and cancelling applications; and listing a student's applications.
6. **Database integrity:** PostgreSQL transactions and advisory locks coordinate seat allocation across concurrent requests. A unique index prevents a student from having multiple active applications for the same class.
7. **Database migrations:** Pending schema migrations run automatically at application startup and are recorded in migration history. Soft-deleted classes retain their application history.
8. **Postman collection:** Import `backend/postman/Admissions API.postman_collection.json` into Postman and set `baseUrl` to `http://localhost:8080` to exercise the API workflow.

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/classes` | Create a class |
| `GET` | `/classes` | List classes and seat counts |
| `GET` | `/classes/{classId}` | Get a class and its seat counts |
| `DELETE` | `/classes/{classId}` | Soft-delete a class |
| `POST` | `/classes/{classId}/holds` | Hold a seat for a student |
| `GET` | `/holds/{holdId}` | Get hold status |
| `POST` | `/holds/{holdId}/confirm` | Confirm the student's hold |
| `DELETE` | `/holds/{holdId}` | Cancel the student's application |
| `GET` | `/me/holds` | List the student's applications |

Hold creation, confirmation, cancellation, and `/me/holds` requests require an `X-Student-Id` header containing exactly 17 digits.