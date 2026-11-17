using Microsoft.AspNetCore.Http;

using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;

namespace Telekinesis.Helper;

public static class JsonHelper
{
    public static readonly JsonSerializerSettings Settings = new()
    {
        ContractResolver = new CamelCasePropertyNamesContractResolver(),
        NullValueHandling = NullValueHandling.Ignore,
    };

    public static string Serialize(object? value) => JsonConvert.SerializeObject(value, Settings);

    public static T? Deserialize<T>(string json) => JsonConvert.DeserializeObject<T>(json, Settings);

    public static IResult Ok(object? value, int status = 200) =>
        Results.Content(Serialize(value), "application/json", System.Text.Encoding.UTF8, status);

    public static async Task<T?> ReadBodyAsync<T>(HttpRequest request)
    {
        using var reader = new StreamReader(request.Body);
        return Deserialize<T>(await reader.ReadToEndAsync());
    }
}
