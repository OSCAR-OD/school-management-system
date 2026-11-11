# SMMS Admissions API

এই .NET API class/shift-এর seat, student application hold, admission confirmation, এবং cancellation পরিচালনা করে। PostgreSQL/Neon-এ সব data থাকে; API চালুর সময় pending SQL migration স্বয়ংক্রিয়ভাবে চলে।

## যা লাগবে

- .NET 11 SDK
- PostgreSQL database; Neon ব্যবহার করলে connection URL-এ `sslmode=require` রাখুন

## Configuration

Repository root-এ থাকা `.env.example` কপি করে root-এ `.env` বানান। Backend এবং frontend একই root `.env` ব্যবহার করে; `.env` Git-এ track হয় না।

`BACKEND_API_URL` একই সঙ্গে frontend-এর API address এবং backend-এর listening address নির্ধারণ করে। Frontend-এর Vite config repository-root `.env` পড়ে। `DATABASE_URL` PostgreSQL URI (`postgresql://` বা `postgres://`) অথবা Npgsql connection string হতে পারে। Environment-এ সরাসরি দেয়া value `.env`-এর value-কে override করবে। `HOLD_DURATION_SECONDS` না দিলে 600 সেকেন্ড ধরা হবে; শূন্য বা ঋণাত্মক value গ্রহণ করা হবে না।

## চালু করা

Repository root থেকে:

```powershell
dotnet run --project .\smms-backend\smms-backend.csproj --launch-profile http
```

API address root `.env`-এর `BACKEND_API_URL` থেকে নির্ধারিত হবে। Backend folder থেকে চালালে:

```powershell
dotnet run --launch-profile http
```

প্রথমবার চালু হলে `Migrations\001_initial_schema.sql` `schema_migrations` history table-এ নথিভুক্ত করে চালানো হবে। পরেরবার আগে চালানো migration আবার চলে না। Database connection বা migration ব্যর্থ হলে app startup-এ error দেখিয়ে বন্ধ হবে। Data PostgreSQL/Neon-এ থাকায় app restart-এ অক্ষত থাকবে।

## API ও Postman

Postman-এ `postman\Admissions API.postman_collection.json` import করুন। Collection variable `baseUrl`-এ root `.env`-এর `BACKEND_API_URL` value দিন; `studentId` অবশ্যই ১৭টি সংখ্যা হতে হবে। Collection Runner-এ সব request উপর থেকে নিচে চালালে class তৈরি, seat hold, hold status দেখা, admission confirm, নিজের application দেখা, application cancel এবং class delete পরীক্ষা হবে। প্রতিটি hold/confirm/cancel/নিজের application request-এ `X-Student-Id` header লাগে।

| Method | Path | ফলাফল |
|---|---|---|
| `POST` | `/classes` | Class তৈরি; `201` |
| `GET` | `/classes` | সব class ও seat count; `200` |
| `GET` | `/classes/{classId}` | একটি class-এর seat count; `200` |
| `DELETE` | `/classes/{classId}` | Class soft-delete; `204`, active hold/confirmed admission থাকলে `409` |
| `POST` | `/classes/{classId}/holds` | Seat hold; `201`, seat/duplicate application হলে `409` |
| `GET` | `/holds/{holdId}` | Hold-এর status; `200` |
| `POST` | `/holds/{holdId}/confirm` | নিজের মেয়াদ না-পেরোনো hold confirm; `200`, মেয়াদ পেরোলে `410` |
| `DELETE` | `/holds/{holdId}` | নিজের application cancel; `204` |
| `GET` | `/me/holds` | Header-এ দেয়া শিক্ষার্থীর সব application; `200` |

Error response-এ JSON `{ "error": "..." }` থাকে। নতুন class-এর ID `c_`-এর পরে ৪-অঙ্কের random number হবে, যেমন `c_1294`; application hold-এর ID হবে `h_`-এর পরে ৪-অঙ্কের random number, যেমন `h_1548`। ID আগে ব্যবহৃত হয়ে থাকলে নতুন সংখ্যা তৈরি হয়। Class delete করতে `DELETE /classes/{classId}` ব্যবহার করুন; active hold বা confirmed admission থাকলে `409` দিয়ে delete আটকায়। Delete soft-delete, তাই পুরোনো application history অক্ষত থাকে। Class তৈরির body:

```json
{
  "name": "Class 6 - Morning Shift",
  "totalSeats": 120
}
```

`/classes` ও `/classes/{classId}` response-এ `totalSeats`, `heldSeats`, `confirmedSeats`, `availableSeats` থাকে। Hold status `HELD`, `CONFIRMED`, `EXPIRED`, অথবা `CANCELLED`। Expiry background worker প্রতি সেকেন্ডে due hold expire করে; API read/write-এও due hold expire করা হয়।

## Concurrency ও data integrity

Seat count পরীক্ষা এবং hold insert একই PostgreSQL transaction-এ হয় এবং transaction-scoped advisory lock দিয়ে serialize করা হয়—একাধিক API instance থেকেও seat oversell হয় না। একই class/student-এর জন্য partial unique index-ও একটির বেশি active (`HELD`/`CONFIRMED`) application আটকায়। Confirm একই hold-এ পুনরায় এলে idempotent response দেয়, seat দ্বিতীয়বার গণনা হয় না। Migration ও API code সবই `smms-backend` folder-এ আছে; Docker/Compose configuration এই setup-এর অংশ নয়।
