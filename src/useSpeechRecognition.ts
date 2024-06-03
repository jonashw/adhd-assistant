import React from "react";

export type ListeningStatus = "off"|"loading"|"listening"|"recognizing";

export type Transcript = {isFinal: boolean; value: string};

export function useSpeechRecognition({
    continuous,
    interimResults,
    lang,
    onRecognize,
    maxAlternatives,
    autoStart
}: {
    continuous?: boolean,
    interimResults?: boolean,
    lang?: string,
    onRecognize?: (transcript: Transcript) => void,
    maxAlternatives?: number,
    autoStart?: boolean
}){
    const [listeningStatus,setListeningStatus] = React.useState<ListeningStatus>("off");
    const [recognition,setRecognition] = React.useState<SpeechRecognition>();
    const [transcript,setTranscript] = React.useState<Transcript>();

    React.useEffect(() => {
        console.log('prop change: ', 'onRecognize')
    },[onRecognize]);

    React.useEffect(() => {
        console.log('INIT');
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = lang ?? "en-US";
        recognition.continuous = continuous ?? false;
        recognition.interimResults = interimResults ?? false;
        if(maxAlternatives){
            recognition.maxAlternatives = maxAlternatives;
        }
        recognition.onstart = () => {
            console.log('start');
            setListeningStatus('loading');
        }
        recognition.onaudiostart = () => {
            console.log('audio start');
            setListeningStatus('listening');
        }
        recognition.onaudioend = () => {
            setListeningStatus('off');
            console.log('audio end');
        }
        recognition.onspeechstart = () => {
            setListeningStatus('recognizing');
            console.log('speech start');
        }
        recognition.onspeechend = () => {
            console.log('speech end');
            setListeningStatus('listening');
        }
        recognition.onresult = (e) => {
            //console.log(e.results);
            const result = e.results[e.results.length-1];
            const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
            //console.log(`on result: "${transcript}"; final: ${result.isFinal}`);
            const t = {value:transcript, isFinal:result.isFinal};
            setTranscript(t);
            if(onRecognize){
                onRecognize(t);
            }
        }
        recognition.onerror = e => {
            console.error("Speech recognition error:", e.error);
            setListeningStatus('off');
        }

        setRecognition(recognition);

        if(autoStart){
            recognition.start();
        }

        return function cleanup(){
            console.info('CLEANUP');
            recognition.stop();
            setListeningStatus('off');
            recognition.onaudiostart = null;
            recognition.onsoundstart = null;
            recognition.onspeechstart = null;
            recognition.onresult = null;
            recognition.onspeechend = null;
            recognition.onsoundend = null;
            recognition.onaudioend = null;
            recognition.onerror = null;
        }
    },[continuous, interimResults, lang, maxAlternatives, onRecognize]);

    const startListening = () => {
        if(listeningStatus !== "off" || !recognition){
            return;
        }
        console.log('cannot start speech recognition yet');
        recognition.start();
    };

    const stopListening = () => {
        if(listeningStatus !== 'listening' || !recognition){
            return;
        }
        console.log('cannot stop speech recognition yet');
        recognition.stop();
    };

    return {
        listeningStatus,
        transcript,
        startListening,
        stopListening
    };
}