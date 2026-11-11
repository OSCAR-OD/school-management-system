public sealed class HoldExpiryService(
    AdmissionsStore store,
    ILogger<HoldExpiryService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1));
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                try
                {
                    await store.ExpireDueHoldsAsync();
                }
                catch (Exception exception)
                {
                    logger.LogError(exception, "Failed to expire due holds; the service will retry on its next tick.");
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }
}
