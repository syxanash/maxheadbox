// yeah I'm know this is dangerous but it was fun to try!
import config from '../config.js';

const name = 'shell';
const params = 'shellCommand';
const description = 'executes a shell command in the terminal and gives back the result';
const dangerous = true;

const execution = async (parameter) => {
  const backendResponse = await fetch(`${config.BACKEND_URL}/shell`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command: parameter }),
  });

  if (!backendResponse.ok) {
    throw new Error(`HTTP error! status: ${backendResponse.status}`);
  }

  const commandOutput = await backendResponse.json();
  const outputText = commandOutput.message;

  return `Output for "${parameter}": "${outputText}".`;
};


export default { name, params, description, execution, dangerous };