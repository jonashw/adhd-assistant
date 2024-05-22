import React from "react";

type ActionParams = { stop: () => void };

export default ({
  grammar,
  maxAlternatives,
  continuous,
  interimResults,
  actions,
}: {
  grammar: string;
  maxAlternatives?: number;
  continuous?: boolean;
  interimResults?: boolean;
  actions: { [phrase: string]: (p: ActionParams) => void };
}) => {
  const [eventLog, setEventLog] = React.useState<string[]>([]);
  const [listening, setListening] = React.useState(false);
  const [recognition, setRecognition] = React.useState<
    SpeechRecognition | undefined
  >();
  const [recognitionResults, setRecognitionResults] = React.useState<
    SpeechRecognitionResult[]
  >([]);
  React.useEffect(() => {
    const SR =
      (<any>window).SpeechRecognition || (<any>window).webkitSpeechRecognition;
    const SGL =
      (<any>window).SpeechGrammarList || (<any>window).webkitSpeechGrammarList;
    //const SGE = (<any>window).SpeechRecognitionEvent || (<any>window).webkitSpeechRecognitionEvent;

    const recognition: SpeechRecognition = new SR();
    const speechRecognitionList: SpeechGrammarList = new SGL();
    speechRecognitionList.addFromString(grammar, 1);
    recognition.grammars = speechRecognitionList;
    recognition.continuous = continuous ?? false;
    recognition.lang = "en-US";
    recognition.interimResults = interimResults ?? false;
    recognition.maxAlternatives = maxAlternatives ?? 1;

    for (const eventType of [
      "error",
      "end",
      "audiostart",
      "audioend",
      "nomatch",
      "result",
      "soundstart",
      "soundend",
      "start",
      "speechstart",
      "speechend",
    ]) {
      recognition.addEventListener(eventType, () => {
        setEventLog((eventLog) => [...eventLog, eventType]);
        console.log(eventType);
      });
    }
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let results = Array.from(e.results);
      setRecognitionResults(results);
      let transcripts = results.map((result) => result[0].transcript);
      console.log({ results: e.results });
      console.log(transcripts.join(", "));

      let latestTranscript = transcripts[transcripts.length - 1].trim();
      if (latestTranscript in actions) {
        console.log(`executing action: ${latestTranscript}`);
        actions[latestTranscript]({ stop: recognition.stop });
      }
    };

    recognition.onstart = () => {
      setListening(true);
      setRecognitionResults([]);
      setEventLog([]);
    };

    recognition.onend = () => {
      setListening(false);
    };

    setRecognition(recognition);
  }, [grammar]);
  return {
    recognitionResults,
    listening,
    eventLog,
    listen: () => {
      if (!recognition) {
        console.log("recognition NOT started");
        return;
      }
      recognition.start();
      console.log("recognition started");
    },
  };
};
