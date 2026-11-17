using Microsoft.AspNetCore.Http;

namespace Telekinesis.Helper;

public static class EndpointHelpers
{
    /// <summary>Runs an endpoint body: ArgumentException → 400, InvalidOperationException → 409, anything else → 500 (logged).</summary>
    public static async Task<IResult> Try(Func<Task<IResult>> body)
    {
        try
        {
            return await body();
        }
        catch (ArgumentException ex)
        {
            return JsonHelper.Ok(new { error = ex.Message }, 400);
        }
        catch (InvalidOperationException ex)
        {
            return JsonHelper.Ok(new { error = ex.Message }, 409);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex);
            return JsonHelper.Ok(new { error = "Unexpected server error." }, 500);
        }
    }
}
