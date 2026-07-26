# VoxCode

VoxCode is a voice-first AI coding agent for the terminal. It combines the existing coding workflow with fully local speech-to-text and text-to-speech.

## Features

- Hands-free coding with `voxcode --voice`
- Runtime switching between Text and Voice with `/mode`
- Local Whisper speech recognition
- Local Kokoro speech synthesis
- Automatic microphone detection and model setup
- Windows, macOS, and Linux support
- The same agents, tools, sessions, and TUI in both interaction modes

## Development

```bash
bun install
bun run dev --voice
```

Voice mode downloads its local model files on first use and caches them for later sessions. Start in normal keyboard mode with `bun run dev`, or switch modes at any time with `/mode`.

## CLI

```bash
voxcode
voxcode --voice
voxcode --help
```

## Credits

VoxCode is a voice-first fork of OpenCode (github.com/anomalyco/opencode)
