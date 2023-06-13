import React from "react";
import KeyboardVoiceIcon from "@mui/icons-material/KeyboardVoice";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import StopIcon from "@mui/icons-material/Stop";
import { SvgIcon, CardActions, Card, CardContent } from "@mui/material";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";

const AudioOutput = {
  play: (src: string) =>
    new Promise<void>((resolve) => {
      let a = new Audio(src);
      a.onended = () => {
        resolve();
      };
      a.play();
    }),
};

export default ({
  onRecordingFinished,
}: {
  onRecordingFinished?: (recording: Blob, play: () => void) => void;
}) => {
  const [recorder, setRecorder] = React.useState<MediaRecorder | undefined>();
  const [recorderState, setRecorderState] = React.useState("loading");
  const [audioSrc, setAudioSrc] = React.useState<string | undefined>();
  const [playing, setPlaying] = React.useState(false);
  React.useEffect(() => {
    let effect = async () => {
      let chunks: BlobPart[] = [];
      let stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        chunks.push(e.data);
        if (recorder.state === "inactive") {
          let blob = new Blob(chunks, { type: "audio/ogg" });
          let url = URL.createObjectURL(blob);
          setAudioSrc(url);

          if (!!onRecordingFinished) {
            onRecordingFinished(blob, () => {
              setPlaying(true);
              AudioOutput.play(url).then(() => setPlaying(false));
            });
          }
          chunks = [];
        }
      };
      setRecorder(recorder);
      setRecorderState("ready");
    };
    effect();
  }, [onRecordingFinished]);

  const canFinish = !!recorder && recorder.state === "recording";
  const canRecord = !!recorder && recorder.state === "inactive";
  const record = () => {
    if (!canRecord) {
      return;
    }
    recorder.start();
    setAudioSrc(undefined);
    setRecorderState(recorder.state);
    setPlaying(false);
  };

  const finish = () => {
    if (!canFinish) {
      return;
    }
    recorder.stop();
    setRecorderState(recorder.state);
  };

  const canPlay = !!audioSrc && !playing;
  const play = () => {
    if (!canPlay) {
      return;
    }
    setPlaying(true);
    AudioOutput.play(audioSrc!).then(() => setPlaying(false));
  };

  const reset = () => {
    if (!audioSrc) {
      return;
    }
    setAudioSrc(undefined);
    setPlaying(false);
  };

  return (
    <Stack spacing={2} direction="column">
      <Card sx={{ flexGrow: 1 }}>
        <CardActions>
          <Stack spacing={2} direction="row" alignItems="center">
            <Button
              sx={{ flexGrow: 1 }}
              variant="contained"
              color="error"
              onClick={record}
              disabled={!canRecord}
            >
              <KeyboardVoiceIcon className="me-2" />
              Record
            </Button>

            <Button variant="contained" onClick={finish} disabled={!canFinish}>
              <StopIcon className="me-2" />
              Stop
            </Button>

            <span>{recorderState}</span>
          </Stack>
        </CardActions>
      </Card>
      {!!audioSrc && (
        <Card>
          <CardActions>
            <Stack spacing={2} direction="row" justifyContent="space-between">
              <Button variant="contained" onClick={play} disabled={!canPlay}>
                <PlayArrowIcon className="me-2" />
                Play
              </Button>

              <Button variant="contained" onClick={reset} color="warning">
                <DeleteForeverIcon className="me-2" />
                Reset
              </Button>
            </Stack>
          </CardActions>
        </Card>
      )}
    </Stack>
  );
};
