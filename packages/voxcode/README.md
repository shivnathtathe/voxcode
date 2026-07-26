# Voxcode voice mode

`opencode --voice` adds local speech input and output to the full TUI. It uses Kokoro for text-to-speech, sherpa-onnx Zipformer for live transcription, and FFmpeg for microphone capture. No audio or text is sent to a voice service.

## Setup

Run `opencode --voice`. No additional installation or environment variables are required.

On first use, voice mode shows a setup message while it downloads the open Zipformer and Kokoro model weights. Models are cached in the platform user cache directory. The sherpa-onnx native runtime and an FFmpeg fallback are distributed with the package.

Speech is decoded while you talk. Partial words appear directly in the terminal prompt, and the prompt is finalized after trailing silence without a separate transcription phase.

Voice mode automatically selects the first available microphone on Windows and macOS. Linux uses the default PulseAudio/PipeWire source with an ALSA fallback. The operating system may ask for microphone permission on first use.

## Configuration

| Variable                 | Purpose                            | Default                               |
| ------------------------ | ---------------------------------- | ------------------------------------- |
| `VOXCODE_MIC_DEVICE`       | Override the detected FFmpeg input       | Automatically detected                |
| `VOXCODE_LISTEN_SECONDS`   | Maximum duration of one spoken prompt    | `30`                                  |
| `VOXCODE_NO_SPEECH_MS`     | Retry delay when no speech is detected   | `5000`                                |
| `VOXCODE_SILENCE_THRESHOLD`| PCM speech-energy threshold              | `500`                                 |
| `VOXCODE_STT_MODEL`        | Directory containing Zipformer files     | Platform voice cache                   |
| `VOXCODE_KOKORO_MODEL`     | Kokoro model ID or local path            | `onnx-community/Kokoro-82M-v1.0-ONNX` |
| `VOXCODE_KOKORO_VOICE`     | Kokoro voice                             | `af_heart`                            |
