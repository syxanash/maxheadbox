import { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import sample from 'lodash/sample';
import isEmpty from 'lodash/isEmpty';
import Markdown from 'react-markdown';

import './WordsContainer.css';

const reactionFaces = import.meta.glob('./assets/reactions/*.png', { eager: true, import: 'default' });
const mouthImages = import.meta.glob('./assets/speaking/*.png', { eager: true, import: 'default' });

function WordsContainer({ backendResponse, recordedMessage, reaction, finished }) {
  const containerRef = useRef(null);
  const [mouth, setMouth] = useState('open1');

  const getNewMouthPosition = useCallback((currentPosition) => {
    const positions = ['open1', 'open2', 'closed'];
    const availablePositions = positions.filter(pos => pos !== currentPosition);
    return sample(availablePositions);
  }, []);

  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    const mouthTimeout = setInterval(() => {
      setMouth(getNewMouthPosition(mouth));
    }, 100);

    return () => { clearInterval(mouthTimeout); };
  }, [getNewMouthPosition, mouth]);

  useEffect(() => {
    scrollToBottom();
  }, [backendResponse]);

  const renderReaction = useCallback(() => {
    let imageName = 'neutral';
    let imageAlt = 'waiting';

    if (reaction !== undefined) {
      imageName = reaction;
      imageAlt = reaction;
    }

    return <div className='reaction-image-container face-float-animation'>
      <img className='reaction-image face-filter-hue' src={reactionFaces[`./assets/reactions/${imageName}.png`]} alt={imageAlt} />
    </div>;
  }, [reaction]);

  const renderSpeaking = useCallback(() => {
    return (
      <div className='reaction-image-container'>
        <div className='face-stack'>
          <img className='face-base face-filter-hue' src={mouthImages[`./assets/speaking/still.png`]} alt='face' />
          <img className='mouth-overlay face-filter-hue' src={mouthImages[`./assets/speaking/${mouth}.png`]} alt='mouth' />
        </div>
      </div>
    );
  }, [mouth]);

  const renderStreamedOutput = useCallback(() => {
    return backendResponse.map((word, index) => (
      <span key={index} className="animate__animated animate__fadeIn animate__faster">
        {word}
      </span>
    ));
  }, [backendResponse]);

  const bakedOutput = useMemo(() => {
    return backendResponse.join('').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  }, [backendResponse]);

  return (
    <div>
      <div ref={containerRef} className='llm-output-container'>
        {isEmpty(backendResponse)
          ? <span className='llm-output-recorded animate__animated animate__fadeIn'>{recordedMessage}</span>
          : <span className='llm-output-text'>
            {finished ? <Markdown>{bakedOutput}</Markdown> : renderStreamedOutput()}
          </span>}
      </div>
      {finished ? renderReaction() : renderSpeaking()}
    </div>
  );
};

export default WordsContainer;