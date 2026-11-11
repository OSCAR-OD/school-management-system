using Microsoft.AspNetCore.Mvc;
using Npgsql;

var projectDirectory = ResolveProjectDirectory();
LoadDotEnv(Path.GetFullPath(Path.Combine(projectDirectory, "..", ".env")));

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = projectDirectory
});
var backendApiUrl = builder.Configuration["BACKEND_API_URL"];
if (!Uri.TryCreate(backendApiUrl, UriKind.Absolute, out var backendUri) ||
    (backendUri.Scheme != Uri.UriSchemeHttp && backendUri.Scheme != Uri.UriSchemeHttps))
{
    throw new InvalidOperationException("BACKEND_API_URL must be an absolute HTTP or HTTPS URL.");
}

builder.WebHost.UseUrls(backendApiUrl);
builder.Services.AddOpenApi();
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.SetIsOriginAllowed(origin =>
        Uri.TryCreate(origin, UriKind.Absolute, out var uri) &&
        (uri.Host == "localhost" || uri.Host == "127.0.0.1"))
        .AllowAnyHeader()
        .AllowAnyMethod()));

var databaseUrl = builder.Configuration["DATABASE_URL"];
if (string.IsNullOrWhiteSpace(databaseUrl))
{
    throw new InvalidOperationException("DATABASE_URL is required. Set it in the repository-root .env file or the process environment.");
}

var holdDurationSeconds = 600;
var durationValue = builder.Configuration["HOLD_DURATION_SECONDS"];
if (durationValue is not null &&
    (!int.TryParse(durationValue, out holdDurationSeconds) || holdDurationSeconds <= 0))
{
    throw new InvalidOperationException("HOLD_DURATION_SECONDS must be a positive integer.");
}

var connectionString = ParseDatabaseUrl(databaseUrl);
builder.Services.AddSingleton(NpgsqlDataSource.Create(connectionString));
builder.Services.AddSingleton<AdmissionsStore>();
builder.Services.AddHostedService<HoldExpiryService>();

var app = builder.Build();
await DatabaseMigrator.MigrateAsync(
    app.Services.GetRequiredService<NpgsqlDataSource>(),
    projectDirectory,
    app.Logger);
app.UseCors();
app.Use(async (context, next) =>
{
    try
    {
        await next();
    }
    catch (AdmissionException exception)
    {
        context.Response.StatusCode = exception.StatusCode;
        await context.Response.WriteAsJsonAsync(new { error = exception.Message });
    }
    catch (BadHttpRequestException exception)
    {
        context.Response.StatusCode = exception.StatusCode;
        await context.Response.WriteAsJsonAsync(new { error = "The request body must be valid JSON." });
    }
    catch (Exception exception)
    {
        app.Logger.LogError(exception, "Unhandled error while processing an admissions API request.");
        if (!context.Response.HasStarted)
        {
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            await context.Response.WriteAsJsonAsync(new { error = "An unexpected server error occurred." });
        }
    }
});

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.MapPost("/classes", async (
    [FromBody] CreateClassRequest? request,
    AdmissionsStore store) =>
{
    if (request is null || string.IsNullOrWhiteSpace(request.Name) || request.TotalSeats <= 0)
    {
        throw new AdmissionException(StatusCodes.Status400BadRequest, "Name and a positive totalSeats value are required.");
    }

    return Results.Json(
        await store.CreateClassAsync(request.Name.Trim(), request.TotalSeats),
        statusCode: StatusCodes.Status201Created);
});

app.MapGet("/classes", async (AdmissionsStore store) =>
    Results.Ok(await store.GetClassesAsync()));

app.MapGet("/classes/{classId}", async (string classId, AdmissionsStore store) =>
    Results.Ok(await store.GetClassAsync(classId)));

app.MapDelete("/classes/{classId}", async (string classId, AdmissionsStore store) =>
{
    await store.DeleteClassAsync(classId);
    return Results.NoContent();
});

app.MapPost("/classes/{classId}/holds", async (
    string classId,
    [FromHeader(Name = "X-Student-Id")] string? studentId,
    AdmissionsStore store) =>
{
    var validatedStudentId = ValidateStudentId(studentId);
    return Results.Json(
        await store.CreateHoldAsync(classId, validatedStudentId, holdDurationSeconds),
        statusCode: StatusCodes.Status201Created);
});

app.MapGet("/holds/{holdId}", async (string holdId, AdmissionsStore store) =>
    Results.Ok(await store.GetHoldAsync(holdId)));

app.MapPost("/holds/{holdId}/confirm", async (
    string holdId,
    [FromHeader(Name = "X-Student-Id")] string? studentId,
    AdmissionsStore store) =>
    Results.Ok(await store.ConfirmHoldAsync(holdId, ValidateStudentId(studentId))));

app.MapDelete("/holds/{holdId}", async (
    string holdId,
    [FromHeader(Name = "X-Student-Id")] string? studentId,
    AdmissionsStore store) =>
{
    await store.CancelHoldAsync(holdId, ValidateStudentId(studentId));
    return Results.NoContent();
});

app.MapGet("/me/holds", async (
    [FromHeader(Name = "X-Student-Id")] string? studentId,
    AdmissionsStore store) =>
    Results.Ok(await store.GetStudentHoldsAsync(ValidateStudentId(studentId))));

app.Run();

static string ResolveProjectDirectory()
{
    var currentDirectory = Directory.GetCurrentDirectory();
    var candidates = new[]
    {
        currentDirectory,
        Path.Combine(currentDirectory, "smms-backend"),
        AppContext.BaseDirectory
    };

    foreach (var candidate in candidates)
    {
        DirectoryInfo? directory = new(Path.GetFullPath(candidate));
        while (directory is not null)
        {
            if (File.Exists(Path.Combine(directory.FullName, "smms-backend.csproj")) &&
                Directory.Exists(Path.Combine(directory.FullName, "Migrations")))
            {
                return directory.FullName;
            }

            directory = directory.Parent;
        }
    }

    throw new DirectoryNotFoundException("Could not locate the smms-backend project directory.");
}

static void LoadDotEnv(string path)
{
    if (!File.Exists(path))
    {
        return;
    }

    foreach (var line in File.ReadLines(path))
    {
        var trimmed = line.Trim();
        if (trimmed.Length == 0 || trimmed.StartsWith('#'))
        {
            continue;
        }

        var separator = trimmed.IndexOf('=');
        if (separator <= 0)
        {
            continue;
        }

        var key = trimmed[..separator].Trim();
        var value = trimmed[(separator + 1)..].Trim();
        if (value.Length >= 2 &&
            ((value[0] == '"' && value[^1] == '"') || (value[0] == '\'' && value[^1] == '\'')))
        {
            value = value[1..^1];
        }

        if (Environment.GetEnvironmentVariable(key) is null)
        {
            Environment.SetEnvironmentVariable(key, value);
        }
    }
}

static string ValidateStudentId(string? studentId)
{
    if (studentId is null || studentId.Length != 17 || studentId.Any(character => character is < '0' or > '9'))
    {
        throw new AdmissionException(StatusCodes.Status400BadRequest, "X-Student-Id must contain exactly 17 digits.");
    }

    return studentId;
}

static string ParseDatabaseUrl(string url)
{
    if (!url.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) &&
        !url.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
    {
        return url;
    }

    if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) ||
        string.IsNullOrWhiteSpace(uri.Host) ||
        string.IsNullOrWhiteSpace(uri.AbsolutePath.Trim('/')))
    {
        throw new InvalidOperationException("DATABASE_URL must include a PostgreSQL host and database name.");
    }

    var builder = new NpgsqlConnectionStringBuilder
    {
        Host = uri.Host,
        Port = uri.IsDefaultPort ? 5432 : uri.Port,
        Database = Uri.UnescapeDataString(uri.AbsolutePath.Trim('/')),
        SslMode = SslMode.Require
    };

    var userInfo = uri.UserInfo.Split(':', 2);
    if (userInfo.Length > 0 && userInfo[0].Length > 0)
    {
        builder.Username = Uri.UnescapeDataString(userInfo[0]);
    }

    if (userInfo.Length > 1)
    {
        builder.Password = Uri.UnescapeDataString(userInfo[1]);
    }

    foreach (var pair in uri.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
    {
        var parts = pair.Split('=', 2);
        if (parts.Length == 2 &&
            Uri.UnescapeDataString(parts[0]).Equals("sslmode", StringComparison.OrdinalIgnoreCase) &&
            Enum.TryParse<SslMode>(Uri.UnescapeDataString(parts[1]), ignoreCase: true, out var sslMode))
        {
            builder.SslMode = sslMode;
        }
    }

    return builder.ConnectionString;
}

public sealed record CreateClassRequest(string Name, int TotalSeats);
