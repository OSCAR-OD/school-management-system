using Npgsql;

public static class DatabaseMigrator
{
    private const long MigrationLockKey = 732419850217L;

    public static async Task MigrateAsync(
        NpgsqlDataSource dataSource,
        string projectDirectory,
        ILogger logger)
    {
        var migrationDirectory = Path.Combine(projectDirectory, "Migrations");
        var migrationFiles = Directory.GetFiles(migrationDirectory, "*.sql")
            .OrderBy(Path.GetFileName, StringComparer.Ordinal)
            .ToArray();

        await using var connection = await dataSource.OpenConnectionAsync();
        await using var transaction = await connection.BeginTransactionAsync();
        await using (var lockCommand = new NpgsqlCommand(
            "SELECT pg_advisory_xact_lock(@lock_key)",
            connection,
            transaction))
        {
            lockCommand.Parameters.AddWithValue("lock_key", MigrationLockKey);
            await lockCommand.ExecuteNonQueryAsync();
        }

        await using (var historyCommand = new NpgsqlCommand(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version text PRIMARY KEY,
                applied_at timestamptz NOT NULL DEFAULT now()
            )
            """,
            connection,
            transaction))
        {
            await historyCommand.ExecuteNonQueryAsync();
        }

        foreach (var migrationFile in migrationFiles)
        {
            var version = Path.GetFileNameWithoutExtension(migrationFile);
            await using var existsCommand = new NpgsqlCommand(
                "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = @version)",
                connection,
                transaction);
            existsCommand.Parameters.AddWithValue("version", version);
            if ((bool)(await existsCommand.ExecuteScalarAsync())!)
            {
                continue;
            }

            var migrationSql = await File.ReadAllTextAsync(migrationFile);
            await using (var migrationCommand = new NpgsqlCommand(migrationSql, connection, transaction))
            {
                await migrationCommand.ExecuteNonQueryAsync();
            }

            await using var recordCommand = new NpgsqlCommand(
                "INSERT INTO schema_migrations (version) VALUES (@version)",
                connection,
                transaction);
            recordCommand.Parameters.AddWithValue("version", version);
            await recordCommand.ExecuteNonQueryAsync();
            logger.LogInformation("Applied database migration {MigrationVersion}.", version);
        }

        await transaction.CommitAsync();
    }
}
