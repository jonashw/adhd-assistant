import React from "react";

export type ListeningStatus = "off"|"loading"|"listening";

export function useSpeechRecognition({
    continuous,
    interimResults,
    lang,
    onRecognize,
    maxAlternatives
}: {
    continuous?: boolean,
    interimResults?: boolean,
    lang?: string,
    onRecognize?: (result: string) => void,
    maxAlternatives?: number
}){
    const [listeningStatus,setListeningStatus] = React.useState<ListeningStatus>("off");
    const [recognition,setRecognition] = React.useState<SpeechRecognition>();
    const [transcript,setTranscript] = React.useState<string>();

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
            console.log('speech start');
        }
        recognition.onspeechend = () => {
            console.log('speech end');
        }
        recognition.onresult = (e) => {
            console.log(e.results);
            const result = e.results[e.results.length-1][0].transcript?.trim();
            console.log(`on result: "${result}"`);
            setTranscript(result);
            if(onRecognize){
                onRecognize(result);
            }
        }
        recognition.onerror = e => {
            console.error("Speech recognition error:", e.error);
        }

        setRecognition(recognition);

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