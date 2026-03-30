import config from '../config.js';

const name = 'wiki';
const params = 'topic';
const description = 'search for a specific topic on Wikipedia.';

const execution = async (parameter) => {
  const topic = parameter;
  const backendResponse = await fetch(`${config.BACKEND_URL}/wiki/${topic}`, {
    method: "GET"
  });

  if (!backendResponse.ok) {
    throw new Error(`HTTP error! status: ${backendResponse.status}`);
  }

  const wikiData = await backendResponse.json();
  const wikiContent = wikiData.summary;

  return `Here is wikipedia page for "${topic}": "${wikiContent}".`;
};

export default { name, params, description, execution };