import {
  Stack,
  Button,
  Card,
  CardActions,
} from "@mui/material";
import {
  KeyboardVoice
} from "@mui/icons-material";
import useSpeechRecognition from "./useSpeechRecognition";

export default function SpechRecognizer() {
  const grammar = `
#JSGF V1.0;
grammar numbers;
public <drinks> = coffee | tea | milk;`.trim();
  const { listening, listen, recognitionResults, eventLog } =
    useSpeechRecognition({
      grammar,
      maxAlternatives: 3,
      continuous: false,
      actions: {
        'tea': () => alert('tea'),
        hello: () => console.log("hello"),
      },
    });

  return (
    <Card sx={{ flexGrow: 1 }}>
      <CardActions>
        <Stack spacing={2} direction="column" alignItems="center">
          <Stack spacing={2} direction="row" alignItems="center">
            <Button
              variant="contained"
              color="error"
              onClick={() => listen()}
              disabled={listening}
            >
              <KeyboardVoice className="me-2" />
              Listen
            </Button>
            <span>{listening ? "Listening..." : "Not listening"}</span>
          </Stack>
          {(recognitionResults.length > 0 || eventLog.length > 0) && (
            <Stack spacing={2} direction="row" alignItems="center">
              {eventLog.length > 0 && (
                <div>
                  {eventLog.map((e, i) => (
                    <div key={i}>{e}</div>
                  ))}
                </div>
              )}
              {recognitionResults.length > 0 && (
                <div>
                  {recognitionResults.map((r) =>
                    Array(r.length)
                      .fill(undefined)
                      .map((_, i) => (
                        <div key={i}>
                          {r.item(i).transcript} (
                          {Math.floor(100 * r.item(i).confidence)}%)
                        </div>
                      ))
                  )}
                </div>
              )}
            </Stack>
          )}
        </Stack>
      </CardActions>
    </Card>
  );
}