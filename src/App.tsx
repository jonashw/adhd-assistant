import React from "react";
import AudioRecorder from "./audio-recorder";
import SpeechRecognizer from "./SpeechRecognizer";
import {
  Container,
  AppBar,
  Typography,
  Toolbar,
  Stack,
  TextField,
  Box,
  CssBaseline
} from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import KeyboardVoiceIcon from "@mui/icons-material/KeyboardVoice";

const appName = "ADHD Assist";
export default function App() {
  const [recognizedText/*, setRecognizedText*/] = React.useState(
    "adflksjdlksdjfs\nsdfsdlkjsdflkjsdflkjsdlfkjs\n"
  );
  const defaultTheme = createTheme();
  return (
    <ThemeProvider theme={defaultTheme}>
      <CssBaseline />
      <AppBar position="relative">
        <Toolbar>
          <KeyboardVoiceIcon sx={{ mr: 2 }} />
          <Typography variant="h6" color="inherit" noWrap>
            {appName}
          </Typography>
        </Toolbar>
      </AppBar>
      <main>
        {/* Hero unit */}
        <Box
          sx={{
            bgcolor: "background.paper",
            pt: 8,
            pb: 6,
          }}
        >
          <Container maxWidth="sm">
            <Typography
              component="h1"
              variant="h2"
              align="center"
              color="text.primary"
              gutterBottom
            >
              {appName}
            </Typography>
            <Typography
              variant="h5"
              align="center"
              color="text.secondary"
              paragraph
            >
              I have ADHD. As my mind meanders and jumps from idea to idea in a
              vast and fanciful world of ideas, I can tell this assistant about
              each topical jump. The assistant will maintain a stack of ideas that will
              lead me back to where I started.  
            </Typography>
            <Stack
              sx={{ pt: 4 }}
              direction="column"
              spacing={2}
              justifyContent="center"
            >
              <AudioRecorder
                onRecordingFinished={(blob: Blob, play: () => void) => {
                  play();
                  console.log({blob});
                  //TODO: recognizeText(blob).then(text => setRecognizedText(text));
                }}
              />
              <SpeechRecognizer />
            </Stack>
          </Container>
        </Box>{" "}
      </main>
      <Container>
        <h2>Alternative Names:</h2>
        <h3>
          <ul>
            {["Logical Follower", "Rabbit Hole Trail"].map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </h3>

        <TextField
          label="Recognized Text"
          multiline
          variant="filled"
          rows={4}
          value={recognizedText}
          disabled={true}
        />
      </Container>
    </ThemeProvider>
  );
}
