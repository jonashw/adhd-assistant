# Listen test (Android)

A throwaway test for the spoken map's live screen (E7 phase 2). It checks whether the Pixel's on-device speech
recogniser can follow a long ramble with pauses, which the
[speech engine analysis](https://claude.ai/artifact/QY4g8gtc3bG3q6nVC3e96x) says decides the engine.

It only listens and logs, and sends nothing anywhere:

- grey words are partial guesses, black words are final;
- an orange `⏎ 240 ms` mark shows each restart and how long the recogniser was deaf;
- The **Mode** list (locked while listening) picks one of three; **Restart at pauses** is the classic mode: each session ends at a silence and starts again;
- **Segmented session** (Android 13+) asks for one long session that hands back a segment at each pause;
- **Own mic, no gaps** (Android 13+) records the mic itself and holds audio across restarts, so words at the edge of a pause should survive;
- the **Punctuation** switch asks the recogniser for punctuation and capitals;
- **Save log** writes the events and a summary to Downloads (and copies them), since a long log is too big to paste.

## The test

1. Install the APK from the `android-listen-test` prerelease on GitHub (the workflow builds it on every push here).
2. Tap **Start** and talk for about 10 minutes, with real pauses, ideally walking around.
3. Tap **Stop**, then **Copy log**, and paste it into the Claude thread.
4. Switch to **Segmented session** and do a shorter run (2–3 minutes), then copy that log too.

It passes if no words go missing at the restarts and the grey words keep up with you.

## Building

`gradle -p android assembleDebug` with JDK 17 and the Android SDK (API 35). There is no Gradle wrapper; CI
uses Gradle 8.11.1. This isn't part of the web app's build or deploy.
