import React from 'react';
import { Transcript, useSpeechRecognition } from './useSpeechRecognition';
import { ListenFab } from './ListenFab';
import { Stack, TextField } from '@mui/material';


export function SpeechRecognitionDemo() {
  const [text, setText] = React.useState("");

  const onSpeech = React.useCallback((transcript: Transcript) => {
    if(!transcript.isFinal){
      return;
    }
    const result = transcript.value;
    if (result.indexOf('alert') === 0) {
      const label = result.replace(/^alert/, '').trim();
      if (label.length === 0) {
        alert('label not long enough');
        return;
      }
      alert(label);
    } else {
      setText(result);
    }
  }, []);

  const { listeningStatus, startListening, stopListening } = useSpeechRecognition({
    onRecognize: onSpeech,
    interimResults: false,
    maxAlternatives: 1,
    continuous: true
  });
  return (
    <Stack direction="column" gap={1} sx={{height:'98vh',px:2,py:2}} justifyContent={"space-between"}>
      <TextField 
        minRows={3}
        value={text}
        disabled={true}
        label="Recognized Text"
        multiline
      />
      <ListenFab start={startListening} stop={stopListening} status={listeningStatus} />
    </Stack>
  );
}
