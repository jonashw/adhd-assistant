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
              direction={{md:'row'}}
              spacing={2}
            >
              <Stack
                direction="column"
                flexShrink={0}
                spacing={2}
                sx={{mb:3,px:3}}
              >
                <SpeechRecognizer />
              </Stack>
              <Container>
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
                  <p>
                    AKA {["Logical Follower", "Rabbit Hole Trail"].join(' AKA ')}
                  </p>
                  <p>
                    I have ADHD. As my mind meanders and jumps from idea to idea in a
                    vast and fanciful world of ideas, I can tell this assistant about
                    each topical jump. The assistant will maintain a stack of ideas that will
                    lead me back to where I started.
                  </p>
                </Typography>
                <div>
                  <p>
                    My head is a balloon, filled with helium and buoyant thoughts. It has a strong tendency to float out of reach and be blown off course by the wind.
                  </p>
                  <p>
                    My body is the holder of this balloon's string.  Its constant gripping leaves the arm muscles tense and sore.  It could use some assistance keeping the balloon from floating away.
                  </p>
                  <p>&quot;You are here.&quot;</p>
                  <p>Those words are marked next to an unmistakable beacon on the map of your ideas, emotions, and experiences.  All items on the map are linked with navigable relationships.  You announce every change in your mental state to your automated assistant, and it will track your progression through the landscape of your thoughts.  </p>
                  <p>Sometimes, it's fun to give your mind a bit more slack.  Letting it fly high can be fun.</p>
                  <p>Why?</p>
                  <p>Like the physical forces of buoyancy and gravity,  my mind's thoughtful forces are constant.  I enjoy many thoughts throughout my days; so many that I tend to (have to?) forget them after a time. It would be nice to have a record of my thoughts so that I could retrieve the more valuable/viable ones.  A major plus would be to use this tool for note-taking with the goal of providing written communication to coworkers.  I could express ideas in a fashion that suits me, then project the data from that model into standard English for the neurotypicals in my life.</p>
                </div>
              </Container>
            </Stack>
          </Container>
        </Box>{" "}
      </main>
    </ThemeProvider>
  );
}
