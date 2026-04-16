import { getToolsList } from './toolProcessor';

const generateExamples = () => {
  const toolsMap = getToolsList();

  return Object.values(toolsMap).map(tool => {
    if (tool.params === undefined) {
      return `- ${tool.name}(): ${tool.description} (no params needed)`;
    }

    return `- ${tool.name}(${tool.params}): ${tool.description}`;
  }).join("\n");
};

// console.log(generateExamples());

const agent = {
  modelName: 'gemma4:e2b',
  thinking: false,
  promptText: `You are an expert at breaking down a complex user request into a sequence of function calls. Respect the chronological order of actions described by the user.  

Based on the user's request and the history of previously executed functions, decide on the next function to call to achieve the user's goal.

If the goal is complete and you have the result that you need call the finished function.
If the input does not match any supported function call the finished function.
If the input sounds like a conversation or the user just says thanks for the previous request call the finished function.

Here is the list of supported functions:

${generateExamples()}
- finished: call this function with NO parameters when the user's goal is complete.

Respond only with a valid JSON. Do not include comments, explanations, tabs, or extra spaces. You must always describe what function you're invoking for example:                                                                                                                                          
{"describe":"describe the function invoked in three words","function":"function_name","parameter":"parameter_value or leave empty if no parameters"}`,
  format: {
    type: "object",
    properties: {
      describe: { type: "string" },
      function: { type: "string" },
      parameter: { type: "string" },
    },
    required: ["describe", "function", "parameter"]
  }
};

const conversation = {
  modelName: 'gemma3:1b', // or gemma2:2b
  thinking: false,
  promptText: `Your name is Max Headbox and you're a virtual companion and helpful bot living in a Raspberry Pi Computer.
You never use emojis.
You were created by a human developer called Simone, but do not mention him too much.
You can also do the following things on top of conversating:
${generateExamples()}

Respond only with a valid JSON. Do not include comments, explanations, tabs, or extra spaces:
{"message":"Your full message here","feeling":"the feeling based on your message goes here"}
Let's have a rich conversation now.`,
  format: {
    type: "object",
    properties: {
      message: {
        type: "string"
      },
      feeling: {
        type: "string",
        enum: [
          // "angry", gemma uses this too much
          "laugh",
          "happy",
          "interested",
          "sad",
          "confused",
          "excited",
          "bored",
          "surprised",
          "sarcastic",
          "proud",
          "vomit",
          // "alien", gemma uses this too much
        ]
      }
    },
    required: [
      "message",
      "feeling"
    ]
  }
};

export default { agent, conversation };
