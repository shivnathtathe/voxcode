# Voxcode voice mode

`opencode --voice` adds local speech input and output to the full TUI. It uses Kokoro for text-to-speech, whisper.cpp for transcription, and FFmpeg for recording and playback. No audio or text is sent to a voice service.

## Setup

1. Install FFmpeg and ensure `ffmpeg` and `ffplay` are on `PATH`.
2. Install whisper.cpp and ensure `whisper-cli` is on `PATH`.
3. Download a whisper.cpp model, such as `ggml-base.en.bin`.
4. Set `VOXCODE_WHISPER_MODEL` to the model's absolute path.
5. On Windows, set `VOXCODE_MIC_DEVICE` to the microphone name shown by `ffmpeg -list_devices true -f dshow -i dummy`.
6. Run `opencode --voice`.

Kokoro downloads its open model weights on first use and caches them locally.

## Configuration

| Variable                  | Purpose                                | Default                               |
| ------------------------- | -------------------------------------- | ------------------------------------- |
| `VOXCODE_WHISPER_MODEL`   | Absolute path to the whisper.cpp model | Required                              |
| `VOXCODE_WHISPER_COMMAND` | whisper.cpp executable                 | `whisper-cli`                         |
| `VOXCODE_MIC_DEVICE`      | FFmpeg input device                    | Platform default except Windows       |
| `VOXCODE_LISTEN_SECONDS`  | Length of each recording               | `8`                                   |
| `VOXCODE_KOKORO_MODEL`    | Kokoro model ID or local path          | `onnx-community/Kokoro-82M-v1.0-ONNX` |
| `VOXCODE_KOKORO_VOICE`    | Kokoro voice                           | `af_heart`                            |
| `VOXCODE_FFMPEG`          | FFmpeg executable                      | `ffmpeg`                              |
| `VOXCODE_FFPLAY`          | FFplay executable                      | `ffplay`                              |

Linux recording uses PulseAudio's `default` source. macOS recording uses AVFoundation device `:0`. Override either with `VOXCODE_MIC_DEVICE` when needed.
