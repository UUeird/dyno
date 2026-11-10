import { Experience } from "../types";

type Weather = NonNullable<Experience["weather"]>;

function icon(conditions: string) {
  const c = conditions.toLowerCase();
  if (c.includes("thunder")) return "⛈️";
  if (c.includes("snow")) return "🌨️";
  if (c.includes("rain") || c.includes("drizzle") || c.includes("shower")) return "🌧️";
  if (c.includes("fog")) return "🌫️";
  if (c.includes("overcast")) return "☁️";
  if (c.includes("partly")) return "⛅";
  if (c.includes("mainly")) return "🌤️";
  return "☀️";
}

export default function WeatherLine({ weather }: { weather: Weather }) {
  if (!weather.conditions && weather.tempC == null) return null;
  const parts = [
    weather.conditions && `${icon(weather.conditions)} ${weather.conditions}`,
    weather.tempC != null && `${Math.round(weather.tempC)}°C`,
    weather.windKph != null && weather.windKph >= 1 && `${Math.round(weather.windKph)} km/h wind`,
    weather.precipitationMm != null && weather.precipitationMm > 0 && `${weather.precipitationMm} mm rain`,
  ].filter(Boolean) as string[];
  return (
    <p className="experience-weather" data-testid="experience-weather">
      {parts.join(" · ")}
    </p>
  );
}
