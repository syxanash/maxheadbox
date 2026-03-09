const WEATHER_DESCRIPTIONS = {
  0: 'Clear sky',
  1: 'Mainly clear, partly cloudy, or overcast',
  2: 'Mainly clear, partly cloudy, or overcast',
  3: 'Mainly clear, partly cloudy, or overcast',
  45: 'Fog and depositing rime fog',
  48: 'Fog and depositing rime fog',
  51: 'Drizzle: Light, moderate, and dense intensity',
  53: 'Drizzle: Light, moderate, and dense intensity',
  55: 'Drizzle: Light, moderate, and dense intensity',
  56: 'Freezing Drizzle: Light and dense intensity',
  57: 'Freezing Drizzle: Light and dense intensity',
  61: 'Rain: Slight, moderate and heavy intensity',
  63: 'Rain: Slight, moderate and heavy intensity',
  65: 'Rain: Slight, moderate and heavy intensity',
  66: 'Freezing Rain: Light and heavy intensity',
  67: 'Freezing Rain: Light and heavy intensity',
  71: 'Snow fall: Slight, moderate, and heavy intensity',
  73: 'Snow fall: Slight, moderate, and heavy intensity',
  75: 'Snow fall: Slight, moderate, and heavy intensity',
  77: 'Snow grains',
  80: 'Rain showers: Slight, moderate, and violent',
  81: 'Rain showers: Slight, moderate, and violent',
  82: 'Rain showers: Slight, moderate, and violent',
  85: 'Snow showers slight and heavy',
  86: 'Snow showers slight and heavy',
  95: 'Thunderstorm: Slight or moderate',
  96: 'Thunderstorm with slight and heavy hail',
  99: 'Thunderstorm with slight and heavy hail',
};

export default function (app) {
  app.get('/weather/:city', async (req, res) => {
    const cityName = encodeURIComponent(req.params.city);

    try {
      const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${cityName}`);
      const geoData = await geoRes.json();

      if (!geoData?.results?.length) {
        return res.status(404).json({ error: `City '${req.params.city}' not found.` });
      }

      const { latitude, longitude, name: displayCity } = geoData.results[0];

      const weatherRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,apparent_temperature,is_day&temperature_unit=celsius&wind_speed_unit=kmh&timezone=auto`
      );
      const weatherData = await weatherRes.json();

      if (!weatherData?.current) {
        return res.status(500).json({ error: `Could not retrieve weather for '${displayCity}'.` });
      }

      const c = weatherData.current;
      const weatherDescription = WEATHER_DESCRIPTIONS[c.weather_code] ?? 'Unknown';
      const isDay = c.is_day === 1 ? 'Yes' : 'No';

      const weather = [
        `City: ${displayCity}`,
        `Temperature: ${c.temperature_2m}°C`,
        `Feels Like: ${c.apparent_temperature}°C`,
        `Description: ${weatherDescription}`,
        `Wind Speed: ${c.wind_speed_10m} km/h`,
        `Humidity: ${c.relative_humidity_2m}%`,
        `Is Day: ${isDay}`,
      ].join('\n');

      res.json({ weather });
    } catch (err) {
      res.status(500).json({ error: `An error occurred: ${err.message}` });
    }
  });
}
