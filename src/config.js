const config = {
  BACKEND_URL: `http://${import.meta.env.VITE_BACKEND_HOST}`,
  WEBSOCKET_URL: `ws://${import.meta.env.VITE_WEBSOCKET_HOST}`,
  OLLAMA_URL: `http://${import.meta.env.VITE_OLLAMA_URL}`,
  FULLSCREEN: true,
};

export default config;