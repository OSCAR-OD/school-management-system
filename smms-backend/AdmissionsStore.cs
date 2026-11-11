using Npgsql;
using System.Security.Cryptography;

public sealed class AdmissionsStore(NpgsqlDataSource dataSource)
{
    private const long AdvisoryLockKey = 732419850216L;

    public async Task<ClassCreatedResponse> CreateClassAsync(string name, int totalSeats)
    {
        return await WithLockAsync(async (connection, transaction) =>
        {
            await ExpireDueHoldsAsync(connection, transaction);
            var id = await GenerateClassIdAsync(connection, transaction);
            await using var command = new NpgsqlCommand(
                "INSERT INTO classes (id, name, total_seats) VALUES (@id, @name, @total_seats)",
                connection,
                transaction);
            command.Parameters.AddWithValue("id", id);
            command.Parameters.AddWithValue("name", name);
            command.Parameters.AddWithValue("total_seats", totalSeats);
            await command.ExecuteNonQueryAsync();
            return new ClassCreatedResponse(id, name, totalSeats);
        });
    }

    public async Task<IReadOnlyList<ClassSeatResponse>> GetClassesAsync()
    {
        return await WithLockAsync(async (connection, transaction) =>
        {
            await ExpireDueHoldsAsync(connection, transaction);
            const string sql = """
                SELECT c.id, c.name, c.total_seats,
                    COUNT(*) FILTER (WHERE h.status = 'HELD') AS held_seats,
                    COUNT(*) FILTER (WHERE h.status = 'CONFIRMED') AS confirmed_seats
                FROM classes c
                LEFT JOIN holds h ON h.class_id = c.id AND h.status IN ('HELD', 'CONFIRMED')
                WHERE c.deleted_at IS NULL
                GROUP BY c.id
                ORDER BY c.created_at, c.id
                """;
            await using var command = new NpgsqlCommand(sql, connection, transaction);
            await using var reader = await command.ExecuteReaderAsync();
            var classes = new List<ClassSeatResponse>();
            while (await reader.ReadAsync())
            {
                classes.Add(ReadClassSeat(reader));
            }

            return classes;
        });
    }

    public async Task<ClassSeatResponse> GetClassAsync(string classId)
    {
        return await WithLockAsync(async (connection, transaction) =>
        {
            await ExpireDueHoldsAsync(connection, transaction);
            const string sql = """
                SELECT c.id, c.name, c.total_seats,
                    COUNT(*) FILTER (WHERE h.status = 'HELD') AS held_seats,
                    COUNT(*) FILTER (WHERE h.status = 'CONFIRMED') AS confirmed_seats
                FROM classes c
                LEFT JOIN holds h ON h.class_id = c.id AND h.status IN ('HELD', 'CONFIRMED')
                WHERE c.id = @class_id AND c.deleted_at IS NULL
                GROUP BY c.id
                """;
            await using var command = new NpgsqlCommand(sql, connection, transaction);
            command.Parameters.AddWithValue("class_id", classId);
            await using var reader = await command.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
            {
                throw new AdmissionException(StatusCodes.Status404NotFound, "Class not found.");
            }

            return ReadClassSeat(reader);
        });
    }

    public async Task DeleteClassAsync(string classId)
    {
        await WithLockAsync(async (connection, transaction) =>
        {
            await ExpireDueHoldsAsync(connection, transaction);
            await GetClassTotalSeatsAsync(connection, transaction, classId);
            const string activeHoldsSql = """
                SELECT EXISTS (
                    SELECT 1 FROM holds
                    WHERE class_id = @class_id
                        AND status IN ('HELD', 'CONFIRMED')
                )
                """;
            await using var activeHoldsCommand = new NpgsqlCommand(activeHoldsSql, connection, transaction);
            activeHoldsCommand.Parameters.AddWithValue("class_id", classId);
            if ((bool)(await activeHoldsCommand.ExecuteScalarAsync())!)
            {
                throw new AdmissionException(
                    StatusCodes.Status409Conflict,
                    "A class cannot be deleted while active holds or confirmed admissions exist.");
            }

            await using var deleteCommand = new NpgsqlCommand(
                "UPDATE classes SET deleted_at = now() WHERE id = @class_id AND deleted_at IS NULL",
                connection,
                transaction);
            deleteCommand.Parameters.AddWithValue("class_id", classId);
            if (await deleteCommand.ExecuteNonQueryAsync() != 1)
            {
                throw new AdmissionException(StatusCodes.Status404NotFound, "Class not found.");
            }

            return true;
        });
    }

    public async Task<CreatedHoldResponse> CreateHoldAsync(string classId, string studentId, int holdDurationSeconds)
    {
        return await WithLockAsync(async (connection, transaction) =>
        {
            await ExpireDueHoldsAsync(connection, transaction);
            var totalSeats = await GetClassTotalSeatsAsync(connection, transaction, classId);
            const string activeSql = """
                SELECT EXISTS (
                    SELECT 1 FROM holds
                    WHERE class_id = @class_id
                        AND student_id = @student_id
                        AND status IN ('HELD', 'CONFIRMED')
                )
                """;
            await using (var activeCommand = new NpgsqlCommand(activeSql, connection, transaction))
            {
                activeCommand.Parameters.AddWithValue("class_id", classId);
                activeCommand.Parameters.AddWithValue("student_id", studentId);
                if ((bool)(await activeCommand.ExecuteScalarAsync())!)
                {
                    throw new AdmissionException(
                        StatusCodes.Status409Conflict,
                        "This student already has an active application for this class.");
                }
            }

            const string seatsSql = """
                SELECT COUNT(*) FILTER (WHERE status = 'HELD') AS held_seats,
                    COUNT(*) FILTER (WHERE status = 'CONFIRMED') AS confirmed_seats
                FROM holds
                WHERE class_id = @class_id AND status IN ('HELD', 'CONFIRMED')
                """;
            int heldSeats;
            int confirmedSeats;
            await using (var seatsCommand = new NpgsqlCommand(seatsSql, connection, transaction))
            {
                seatsCommand.Parameters.AddWithValue("class_id", classId);
                await using var reader = await seatsCommand.ExecuteReaderAsync();
                await reader.ReadAsync();
                heldSeats = reader.GetInt32(0);
                confirmedSeats = reader.GetInt32(1);
            }

            if (heldSeats + confirmedSeats >= totalSeats)
            {
                throw new AdmissionException(StatusCodes.Status409Conflict, "No seats are available in this class.");
            }

            var holdId = await GenerateHoldIdAsync(connection, transaction);
            var expiresAt = DateTimeOffset.UtcNow.AddSeconds(holdDurationSeconds);
            const string insertSql = """
                INSERT INTO holds (hold_id, class_id, student_id, status, expires_at)
                VALUES (@hold_id, @class_id, @student_id, 'HELD', @expires_at)
                """;
            await using var insertCommand = new NpgsqlCommand(insertSql, connection, transaction);
            insertCommand.Parameters.AddWithValue("hold_id", holdId);
            insertCommand.Parameters.AddWithValue("class_id", classId);
            insertCommand.Parameters.AddWithValue("student_id", studentId);
            insertCommand.Parameters.AddWithValue("expires_at", expiresAt);
            await insertCommand.ExecuteNonQueryAsync();
            return new CreatedHoldResponse(holdId, classId, studentId, "HELD", expiresAt);
        });
    }

    public async Task<HoldDetailsResponse> GetHoldAsync(string holdId)
    {
        return await WithLockAsync(async (connection, transaction) =>
        {
            await ExpireDueHoldsAsync(connection, transaction);
            const string sql = """
                SELECT hold_id, class_id, status, expires_at
                FROM holds WHERE hold_id = @hold_id
                """;
            await using var command = new NpgsqlCommand(sql, connection, transaction);
            command.Parameters.AddWithValue("hold_id", holdId);
            await using var reader = await command.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
            {
                throw new AdmissionException(StatusCodes.Status404NotFound, "Application not found.");
            }

            return new HoldDetailsResponse(
                reader.GetString(0),
                reader.GetString(1),
                reader.GetString(2),
                reader.GetFieldValue<DateTimeOffset>(3));
        });
    }

    public async Task<HoldActionResponse> ConfirmHoldAsync(string holdId, string studentId)
    {
        return await WithLockAsync(async (connection, transaction) =>
        {
            await ExpireDueHoldsAsync(connection, transaction);
            var hold = await GetHoldForUpdateAsync(connection, transaction, holdId);
            EnsureOwner(hold.StudentId, studentId);

            if (hold.Status == "CONFIRMED")
            {
                return new HoldActionResponse(hold.HoldId, hold.Status);
            }

            if (hold.Status == "EXPIRED")
            {
                throw new AdmissionException(StatusCodes.Status410Gone, "This application has expired.");
            }

            if (hold.Status != "HELD")
            {
                throw new AdmissionException(StatusCodes.Status409Conflict, "This application is no longer active.");
            }

            await using var command = new NpgsqlCommand(
                "UPDATE holds SET status = 'CONFIRMED' WHERE hold_id = @hold_id",
                connection,
                transaction);
            command.Parameters.AddWithValue("hold_id", holdId);
            await command.ExecuteNonQueryAsync();
            return new HoldActionResponse(hold.HoldId, "CONFIRMED");
        });
    }

    public async Task CancelHoldAsync(string holdId, string studentId)
    {
        await WithLockAsync(async (connection, transaction) =>
        {
            await ExpireDueHoldsAsync(connection, transaction);
            var hold = await GetHoldForUpdateAsync(connection, transaction, holdId);
            EnsureOwner(hold.StudentId, studentId);

            if (hold.Status is "HELD" or "CONFIRMED")
            {
                await using var command = new NpgsqlCommand(
                    "UPDATE holds SET status = 'CANCELLED' WHERE hold_id = @hold_id",
                    connection,
                    transaction);
                command.Parameters.AddWithValue("hold_id", holdId);
                await command.ExecuteNonQueryAsync();
            }

            return true;
        });
    }

    public async Task<IReadOnlyList<StudentHoldResponse>> GetStudentHoldsAsync(string studentId)
    {
        return await WithLockAsync(async (connection, transaction) =>
        {
            await ExpireDueHoldsAsync(connection, transaction);
            const string sql = """
                SELECT h.hold_id, h.class_id, c.name, h.status, h.expires_at
                FROM holds h
                INNER JOIN classes c ON c.id = h.class_id
                WHERE h.student_id = @student_id
                ORDER BY h.created_at DESC
                """;
            await using var command = new NpgsqlCommand(sql, connection, transaction);
            command.Parameters.AddWithValue("student_id", studentId);
            await using var reader = await command.ExecuteReaderAsync();
            var holds = new List<StudentHoldResponse>();
            while (await reader.ReadAsync())
            {
                holds.Add(new StudentHoldResponse(
                    reader.GetString(0),
                    reader.GetString(1),
                    reader.GetString(2),
                    reader.GetString(3),
                    reader.GetFieldValue<DateTimeOffset>(4)));
            }

            return holds;
        });
    }

    public async Task ExpireDueHoldsAsync()
    {
        await WithLockAsync(async (connection, transaction) =>
        {
            await ExpireDueHoldsAsync(connection, transaction);
            return true;
        });
    }

    private async Task<T> WithLockAsync<T>(Func<NpgsqlConnection, NpgsqlTransaction, Task<T>> action)
    {
        await using var connection = await dataSource.OpenConnectionAsync();
        await using var transaction = await connection.BeginTransactionAsync();
        await using (var lockCommand = new NpgsqlCommand("SELECT pg_advisory_xact_lock(@lock_key)", connection, transaction))
        {
            lockCommand.Parameters.AddWithValue("lock_key", AdvisoryLockKey);
            await lockCommand.ExecuteNonQueryAsync();
        }

        var result = await action(connection, transaction);
        await transaction.CommitAsync();
        return result;
    }

    private static async Task ExpireDueHoldsAsync(NpgsqlConnection connection, NpgsqlTransaction transaction)
    {
        await using var command = new NpgsqlCommand(
            "UPDATE holds SET status = 'EXPIRED' WHERE status = 'HELD' AND expires_at <= now()",
            connection,
            transaction);
        await command.ExecuteNonQueryAsync();
    }

    private static async Task<string> GenerateClassIdAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction)
    {
        for (var attempt = 0; attempt < 100; attempt++)
        {
            var id = $"c_{RandomNumberGenerator.GetInt32(1000, 10000)}";
            await using var command = new NpgsqlCommand(
                "SELECT EXISTS (SELECT 1 FROM classes WHERE id = @id)",
                connection,
                transaction);
            command.Parameters.AddWithValue("id", id);
            if (!(bool)(await command.ExecuteScalarAsync())!)
            {
                return id;
            }
        }

        throw new AdmissionException(
            StatusCodes.Status503ServiceUnavailable,
            "Could not generate an available class ID. Please try again.");
    }

    private static async Task<string> GenerateHoldIdAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction)
    {
        for (var attempt = 0; attempt < 100; attempt++)
        {
            var holdId = $"h_{RandomNumberGenerator.GetInt32(1000, 10000)}";
            await using var command = new NpgsqlCommand(
                "SELECT EXISTS (SELECT 1 FROM holds WHERE hold_id = @hold_id)",
                connection,
                transaction);
            command.Parameters.AddWithValue("hold_id", holdId);
            if (!(bool)(await command.ExecuteScalarAsync())!)
            {
                return holdId;
            }
        }

        throw new AdmissionException(
            StatusCodes.Status503ServiceUnavailable,
            "Could not generate an available application ID. Please try again.");
    }

    private static async Task<int> GetClassTotalSeatsAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        string classId)
    {
        await using var command = new NpgsqlCommand(
            "SELECT total_seats FROM classes WHERE id = @class_id AND deleted_at IS NULL",
            connection,
            transaction);
        command.Parameters.AddWithValue("class_id", classId);
        var result = await command.ExecuteScalarAsync();
        return result is int totalSeats
            ? totalSeats
            : throw new AdmissionException(StatusCodes.Status404NotFound, "Class not found.");
    }

    private static async Task<HoldRecord> GetHoldForUpdateAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        string holdId)
    {
        await using var command = new NpgsqlCommand(
            "SELECT hold_id, student_id, status FROM holds WHERE hold_id = @hold_id",
            connection,
            transaction);
        command.Parameters.AddWithValue("hold_id", holdId);
        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            throw new AdmissionException(StatusCodes.Status404NotFound, "Application not found.");
        }

        return new HoldRecord(reader.GetString(0), reader.GetString(1), reader.GetString(2));
    }

    private static ClassSeatResponse ReadClassSeat(NpgsqlDataReader reader)
    {
        var totalSeats = reader.GetInt32(2);
        var heldSeats = checked((int)reader.GetInt64(3));
        var confirmedSeats = checked((int)reader.GetInt64(4));
        return new ClassSeatResponse(
            reader.GetString(0),
            reader.GetString(1),
            totalSeats,
            heldSeats,
            confirmedSeats,
            totalSeats - heldSeats - confirmedSeats);
    }

    private static void EnsureOwner(string holdStudentId, string studentId)
    {
        if (holdStudentId != studentId)
        {
            throw new AdmissionException(StatusCodes.Status403Forbidden, "This application belongs to a different student.");
        }
    }

    private sealed record HoldRecord(string HoldId, string StudentId, string Status);
}

public sealed class AdmissionException(int statusCode, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}

public sealed record ClassCreatedResponse(string Id, string Name, int TotalSeats);

public sealed record ClassSeatResponse(
    string Id,
    string Name,
    int TotalSeats,
    int HeldSeats,
    int ConfirmedSeats,
    int AvailableSeats);

public sealed record CreatedHoldResponse(
    string HoldId,
    string ClassId,
    string StudentId,
    string Status,
    DateTimeOffset ExpiresAt);

public sealed record HoldDetailsResponse(
    string HoldId,
    string ClassId,
    string Status,
    DateTimeOffset ExpiresAt);

public sealed record HoldActionResponse(string HoldId, string Status);

public sealed record StudentHoldResponse(
    string HoldId,
    string ClassId,
    string ClassName,
    string Status,
    DateTimeOffset ExpiresAt);
