import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Ollama } from 'ollama/browser';
import get from 'lodash/get';
import sample from 'lodash/sample';
import 'animate.css';
import config from './config.js';
import utils from './utils.js';
import { processTool, isDangerous } from './toolProcessor.js';
import SystemPrompt from './systemPrompt.js';
import StatusMessage from './StatusMessage';
import WordsContainer from './WordsContainer';
import Faces from './Faces';
import './App.css';

const APP_STATUS = {
  RECORDING: 0,
  IDLE: 1,
  THINKING: 2,
  BOOT: 3,
  PROCESSING_RECORDING: 4,
  SPEAKING: 5,
  SCREENSAVER: 6,
};

const ollama = new Ollama({ host: config.OLLAMA_URL });

function App() {
  const [recordedMessage, setRecordedMessage] = useState('');
  const [backendResponse, setBackendResponse] = useState([]);
  const [finishedStreaming, setFinishedStreaming] = useState(undefined);

  const [reaction, setReaction] = useState(undefined);

  const [showFace, setShowFace] = useState(true);
  const [face, setFace] = useState('idle');

  const [appStatus, setAppStatus] = useState(APP_STATUS.BOOT);

  const [statusMessage, setStatusMessage] = useState(true);
  const [internalMessage, setInternalMessage] = useState('');

  const globalAgentChatRef = useRef([]);
  const globalMessagesRef = useRef([]);

  const screenSaverTimeoutRef = useRef(null);
  const randomQuestionTimeout = useRef(null);
  const hasAskedPermissionRef = useRef(false);
  const functionRecall = useRef(undefined);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const randomEngagement = useCallback(() => {
    const engagementPrompts = [
      'ask the user a random question out of the blue now!',
      'tell the user a stupid joke',
      'tell the user a joke with a pun',
      "tell the user that you're feeling ungry and that if he taps the screen they'll feed you digitally"
    ];

    if (randomQuestionTimeout.current) {
      clearTimeout(randomQuestionTimeout.current);
    }

    randomQuestionTimeout.current = setTimeout(() => {
      processConversation(sample(engagementPrompts), 'system');
      randomQuestionTimeout.current = null;
    }, 3 * 60 * 1000);
  }, []);

  const clearScreenSaverTimeout = useCallback(() => {
    if (screenSaverTimeoutRef.current) {
      clearTimeout(screenSaverTimeoutRef.current);
    }
  }, []);

  const startScreensaverTimeout = useCallback(() => {
    screenSaverTimeoutRef.current = setTimeout(() => {
      const randomFace = sample(['idle', 'sleepy']);
      setShowFace(true);
      setFace(randomFace);
      setAppStatus(APP_STATUS.SCREENSAVER);
      screenSaverTimeoutRef.current = null;

      randomEngagement();
    }, 15 * 1000);
  }, [randomEngagement]);

  const spawnListener = useCallback(async () => {
    try {
      await fetch(`${config.BACKEND_URL}/spawn-listener`, {
        method: 'POST',
      });
    } catch (err) {
      console.error("Error starting recording:", err);
    }

    startScreensaverTimeout();
  }, [startScreensaverTimeout]);

  // MARK: Process Convs cbk

  const processConversation = useCallback(async (userInput, inputRole = 'user') => {
    globalMessagesRef.current.push({ role: inputRole, content: userInput });

    const payload = {
      model: SystemPrompt.conversation.modelName,
      messages: [{ role: 'user', content: SystemPrompt.conversation.promptText }, ...globalMessagesRef.current],
      think: SystemPrompt.conversation.thinking,
      stream: true,
      keep_alive: -1,
      format: SystemPrompt.conversation.format
    };

    let aggregatedResponse = { role: "assistant", content: "" };

    try {
      const response = await ollama.chat(payload);

      setBackendResponse([]);

      await utils.processStreamResponse(response, setBackendResponse, setReaction, () => {
        setAppStatus(APP_STATUS.SPEAKING);
        setFinishedStreaming(false);
        setStatusMessage(false);
        setShowFace(false);
      }, (chunk) => {
        aggregatedResponse.content += chunk;
      }, () => {
        setFinishedStreaming(true);
      });

      globalMessagesRef.current.push(aggregatedResponse);
      console.log("Conversation: ", globalMessagesRef.current);

      await spawnListener();

      setAppStatus(APP_STATUS.IDLE);

    } catch (error) {
      if (error.name === 'AbortError') {
        console.info("Fetch request aborted.");
        globalMessagesRef.current.push(aggregatedResponse);
        setAppStatus(APP_STATUS.IDLE);
        setBackendResponse([]);
        setRecordedMessage('*Interrupted*');
        setFinishedStreaming(true);
        globalMessagesRef.current.push({ role: 'system', content: 'User has kindly asked you to stop speaking for now.' });

        await spawnListener();
      } else {
        setAppStatus('');
        setFace('dead');
        console.error("Error occurred:", error);
      }
    }
  }, [spawnListener]);

  // MARK: Agent Request cbk

  const agentRequest = useCallback(async (userInput) => {
    setBackendResponse([]);

    let toolLoopGuard = 0;
    let toolResult = undefined;
    let cumulativeResult = '';
    let lastCalledFunction = null;
    let consecutiveCallCount = 0;

    if (!hasAskedPermissionRef.current) {
      globalAgentChatRef.current = [{
        role: 'user',
        content: userInput
      }];
    }

    if (hasAskedPermissionRef.current) {
      hasAskedPermissionRef.current = false;
      const userGaveConsent = /(yes|ok|yeah|sure|yep|alright)/i.test(userInput);

      const recalledToolCall = JSON.parse(functionRecall.current);
      functionRecall.current = undefined;

      if (userGaveConsent) {
        console.log("✅ User granted permission. Executing tool...");
        setBackendResponse(prev => [...prev, `Permission granted!\n\nExecuting ${recalledToolCall.function}...\n\n`]);

        toolResult = await processTool({ ...recalledToolCall, consent: true });
        cumulativeResult += `Task result: "${toolResult}"\n`;

        globalAgentChatRef.current.push({
          role: 'user',
          content: `Task result for "${recalledToolCall.function}": "${toolResult}". Now continue with the original plan.`
        });
      } else {
        console.log("❌ User denied permission.");
        globalAgentChatRef.current.push({
          role: 'user',
          content: `The user has DENIED permission to execute the function "${recalledToolCall.function}". Acknowledge this and inform the user that you cannot proceed with that specific task.`
        });
      }
    }

    while (toolLoopGuard < 5) {
      toolLoopGuard++;

      try {
        const response = await ollama.chat({
          model: SystemPrompt.agent.modelName,
          messages: [{ role: 'user', content: SystemPrompt.agent.promptText }, ...globalAgentChatRef.current],
          think: SystemPrompt.agent.thinking,
          stream: false,
          keep_alive: -1,
          format: SystemPrompt.agent.format
        });

        setShowFace(false);

        const toolCallMessage = response.message;
        globalAgentChatRef.current.push(toolCallMessage);

        const toolContent = JSON.parse(toolCallMessage.content);
        const functionName = toolContent?.function;
        const description = toolContent?.describe ?? 'doing stuff...';

        console.log(`📝 ${JSON.stringify(toolContent)}`);

        console.log(`🤖 Model wants to call: ${functionName}("${toolContent?.parameter}")`);

        setBackendResponse(prev => [...prev, `${toolLoopGuard}. ${description}...\n\n`]);

        if (functionName === lastCalledFunction) {
          consecutiveCallCount++;
        } else {
          lastCalledFunction = functionName;
          consecutiveCallCount = 1;
        }

        if (consecutiveCallCount >= 2 && functionName !== 'finished') {
          console.log(`⚠️ Unusual "${functionName}" called consecutively.`);
        }

        if (functionName.includes('finished')) {
          console.log("✅ Task finished.");
          break;
        }

        const dangerous = isDangerous(toolContent);
        if (dangerous && !hasAskedPermissionRef.current) {
          console.log("🚨 Dangerous tool requires permission.");
          hasAskedPermissionRef.current = true;

          functionRecall.current = JSON.stringify(toolContent);

          cumulativeResult = `Ask the user for permission (they simply have to say YES or NO) to execute the tool: ${toolContent.function}(${toolContent.parameter}). The tool you must execute next, if consent is given, is: ${toolContent.function}`;

          break;
        }

        toolResult = await processTool(toolContent);

        if (toolResult !== undefined) {
          cumulativeResult += `Task ${toolLoopGuard} result: "${toolResult}"\n`;
        }

        console.log(`🛠️ Tool Result: "${toolResult}"`);

        globalAgentChatRef.current.push({
          role: 'user', // this should be system but I noticed is slightly slower if I do that
          content: `Task ${toolLoopGuard} - function "${functionName}", result: "${toolResult}". If the list of tasks I've asked is finished call finished(), otherwise continue calling a new function...`
        });
      } catch (error) {
        console.error("Error during tool interpretation:", error);
        toolResult = 'An error occurred while processing your request. Please try again.';
        break;
      }
    }

    console.log("Agent: ", globalAgentChatRef.current);
    setShowFace(true);
    setAppStatus(APP_STATUS.THINKING);

    if (hasAskedPermissionRef.current) {
      processConversation(cumulativeResult, 'user');
    } else {
      if (toolResult === undefined) {
        setFace('reading');
        processConversation(userInput, 'user');
      } else {
        setFace('love');
        cumulativeResult = cumulativeResult || 'You executed no tasks';
        const conversationPrompt = `User asked: ${userInput}.\n${cumulativeResult}, communicate the results with the user.`;
        processConversation(conversationPrompt, 'user');
      }
    }
  }, [processConversation]);

  // MARK: Start Recording cbk

  const handleStartRecording = useCallback(async () => {
    clearScreenSaverTimeout();

    setShowFace(false);

    try {
      const response = await fetch(`${config.BACKEND_URL}/start_recording`, {
        method: 'POST',
      });
      const data = await response.json();

      if (get(data, 'message', '') === 'Recording started.') {
        setAppStatus(APP_STATUS.RECORDING);
        setStatusMessage(true);
        setInternalMessage('Listening...');
      }
    } catch (err) {
      console.error("Error starting recording:", err);
    }
  }, [clearScreenSaverTimeout]);

  // MARK: Initiate App cbk

  const initiateApp = useCallback(async () => {
    if (config.FULLSCREEN)
      utils.toggleFullscreen();

    setAppStatus(APP_STATUS.THINKING);
    setShowFace(false);
    setStatusMessage(true);
    setBackendResponse([]);

    let aggregatedResponse = { role: "assistant", content: "" };

    try {
      setInternalMessage('Loading...');
      globalAgentChatRef.current.push({ role: 'user', content: 'call finished function!' });
      const agentResponse = await ollama.chat({
        model: SystemPrompt.agent.modelName,
        messages: [{ role: 'user', content: SystemPrompt.agent.promptText }, ...globalAgentChatRef.current],
        think: SystemPrompt.agent.thinking,
        stream: false,
        keep_alive: -1,
        format: SystemPrompt.agent.format
      });

      globalAgentChatRef.current.push({ role: 'assistant', content: agentResponse.message.content });
      console.log("Agent response: ", globalAgentChatRef.current);

      setInternalMessage('Almost there...');
      globalMessagesRef.current.push({ role: 'system', content: 'Greet the user!' });
      const response = await ollama.chat({
        model: SystemPrompt.conversation.modelName,
        messages: [{ role: 'user', content: SystemPrompt.conversation.promptText }, ...globalMessagesRef.current],
        think: SystemPrompt.conversation.thinking,
        stream: true,
        keep_alive: -1,
        format: SystemPrompt.conversation.format
      });

      await utils.processStreamResponse(response, setBackendResponse, setReaction, () => {
        setAppStatus(APP_STATUS.SPEAKING);
        setFinishedStreaming(false);
        setStatusMessage(false);
        setShowFace(false);
      }, (chunk) => {
        aggregatedResponse.content += chunk;
      }, () => {
        setFinishedStreaming(true);
      });

      globalMessagesRef.current.push(aggregatedResponse);
      console.log("Conversation: ", globalMessagesRef.current);
      await spawnListener();

      setAppStatus(APP_STATUS.IDLE);

    } catch (error) {
      if (error.name === 'AbortError') {
        console.info("Fetch request aborted.");
        globalMessagesRef.current.push(aggregatedResponse);
        setAppStatus(APP_STATUS.IDLE);
        setBackendResponse([]);
        setRecordedMessage('*Interrupted*');
        setFinishedStreaming(true);
        globalMessagesRef.current.push({ role: 'system', content: 'User has kindly asked you to stop speaking for now.' });

        await spawnListener();
      } else {
        setShowFace(true);
        setAppStatus('');
        setFace('dead');
        console.error("Error occurred:", error);
      }
    }
  }, [spawnListener]);

  // MARK: App State MAP

  const stopStreaming = useCallback(() => {
    ollama.abort();
    console.info("Attempting to stop streaming...");
  }, []);

  const APP_STATE_MAP = useMemo(() => ({
    [APP_STATUS.RECORDING]: {
      ribbonClass: 'record',
      onClick: async () => {
        // Send a manual stop signal WebSocket will handle the rest
        await fetch(`${config.BACKEND_URL}/stop_recording`, { method: 'POST' });
      },
    },
    [APP_STATUS.IDLE]: {
      ribbonClass: 'idle',
      onClick: async () => {
        await fetch(`${config.BACKEND_URL}/wake`, { method: 'POST' });
      },
    },
    [APP_STATUS.SPEAKING]: {
      ribbonClass: '',
      onClick: () => stopStreaming(),
    },
    [APP_STATUS.SCREENSAVER]: {
      ribbonClass: '',
      onClick: () => {
        setAppStatus(APP_STATUS.IDLE);
        setShowFace(false);
        clearScreenSaverTimeout();
        startScreensaverTimeout();
      },
    },
    [APP_STATUS.PROCESSING_RECORDING]: {
      ribbonClass: 'rainbow',
      onClick: null,
    },
    [APP_STATUS.BOOT]: {
      ribbonClass: 'idle',
      onClick: initiateApp,
    },
    [APP_STATUS.THINKING]: {
      ribbonClass: 'rainbow',
      onClick: null,
    },
  }), [clearScreenSaverTimeout, initiateApp, startScreensaverTimeout, stopStreaming]);

  const renderRibbon = useCallback(() => {
    return APP_STATE_MAP[appStatus]?.ribbonClass || '';
  }, [APP_STATE_MAP, appStatus]);

  // MARK: Handle Tap cbk

  const handleClickAction = useCallback(() => {
    if (screenSaverTimeoutRef.current) {
      clearTimeout(screenSaverTimeoutRef.current);
      screenSaverTimeoutRef.current = null;
    }

    if (randomQuestionTimeout.current) {
      clearTimeout(randomQuestionTimeout.current);
      randomQuestionTimeout.current = null;
    }

    const onClickHandler = APP_STATE_MAP[appStatus]?.onClick;

    if (onClickHandler) {
      onClickHandler();
    }
  }, [APP_STATE_MAP, appStatus]);

  // MARK: WebSocket Effect

  useEffect(() => {
    const ws = new WebSocket(`${config.WEBSOCKET_URL}/ws`);

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log("Received WebSocket message:", message);

        if (message.event === 'recording_finished') {
          setStatusMessage(false);
          setShowFace(true);
          setFace('reading');
          setAppStatus(APP_STATUS.THINKING);

          if (message.output) {
            setRecordedMessage(message.output);
            agentRequest(message.output);
          } else {
            setRecordedMessage('*Silence*');
            processConversation('User sent no response. Let the user know about this.', 'system');
          }
        } else if (message.event === 'process_recording') {
          setAppStatus(APP_STATUS.PROCESSING_RECORDING);

          setShowFace(true);
          setStatusMessage(false);
          setFace('thinking');
          setReaction(undefined);
        } else if (message.event === 'recording_error') {
          setRecordedMessage('*Error*');
          processConversation(message.error, 'system');
        } else if (message.event === 'wake_word_received') {
          handleStartRecording();
        }
      } catch (err) {
        console.error("Error handling WebSocket message:", err);
      }
    };

    ws.onclose = () => {
    };

    return () => {
      ws.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // MARK: Main Render

  const renderContent = useCallback(() => {
    if (showFace) {
      return <Faces face={face} />;
    }
    return statusMessage
      ? <StatusMessage message={internalMessage} />
      : <WordsContainer backendResponse={backendResponse} recordedMessage={recordedMessage} reaction={reaction} finished={finishedStreaming} />;
  }, [backendResponse, face, finishedStreaming, internalMessage, reaction, recordedMessage, showFace, statusMessage]);

  return (
    <div className={`action-ribbon ${renderRibbon()}`} onClick={handleClickAction}>
      {renderContent()}
    </div>
  );
}

export default App;
