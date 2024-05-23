import SpeechRecognizer from "./SpeechRecognizer";
import {
  Container,
  AppBar,
  Typography,
  Toolbar,
  Stack,
  Box,
  CssBaseline
} from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import KeyboardVoiceIcon from "@mui/icons-material/KeyboardVoice";

const appName = "ADHD Assist";
export default function App() {
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
        <Box
          sx={{
            pt: 4,
            bgcolor: "background.paper",
          }}
        >
          <Container maxWidth={"xl"}>
            <Stack
              direction={"column"}
              spacing={2}
            >
              <Typography
                component="h3"
                variant="h3"
                color="text.primary"
                gutterBottom
              >
                {appName}
              </Typography>

              <Typography
                variant="h6"
                color="text.secondary"
              >
                As my mind meanders and jumps from idea to idea in a
                vast and fanciful world of ideas, I can tell this assistant about
                each topical jump. The assistant will maintain a stack of ideas that will
                lead me back to where I started.
              </Typography>
                
              <SpeechRecognizer />
            </Stack>
          </Container>
        </Box>
      </main>
    </ThemeProvider>
  );
}
