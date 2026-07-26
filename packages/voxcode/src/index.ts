import path from "node:path"
import os from "node:os"

export type VoiceMode = {
  speak(text: string): Promise<void>
  listen(): Promise<string>
  dispose(): Promise<void>
}

type ProcessOptions = {
  command: string
  args: string[]
}

export function createVoiceMode(): VoiceMode {
  const directory = path.join(os.tmpdir(), `opencode-voice-${process.pid}`)
  const files = new Set<string>()
  let tts: ReturnType<typeof loadTts> | undefined
  let sequence = Promise.resolve()
  let disposed = false

  const enqueue = <T>(task: () => Promise<T>) => {
    const result = sequence.then(task, task)
    sequence = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  return {
    speak(text) {
      return enqueue(async () => {
        if (disposed || !text.trim()) return
        await ensureDirectory(directory)
        const output = path.join(directory, `speech-${Date.now()}.wav`)
        files.add(output)
        const model = await (tts ??= loadTts())
        const audio = await model.generate(toSpeech(text), {
          voice: (process.env.VOXCODE_KOKORO_VOICE ?? "af_heart") as NonNullable<
            Parameters<typeof model.generate>[1]
          >["voice"],
        })
        audio.save(output)
        await run(player(output))
        await remove(output)
        files.delete(output)
      })
    },
    listen() {
      return enqueue(async () => {
        if (disposed) return ""
        await ensureDirectory(directory)
        const input = path.join(directory, `input-${Date.now()}.wav`)
        files.add(input)
        await run(recorder(input))
        const text = await transcribe(input)
        await remove(input)
        files.delete(input)
        return text
      })
    },
    async dispose() {
      disposed = true
      await sequence
      await Promise.all([...files].map(remove))
      await remove(directory)
    },
  }
}

async function loadTts() {
  const { KokoroTTS } = await import("kokoro-js")
  return KokoroTTS.from_pretrained(process.env.VOXCODE_KOKORO_MODEL ?? "onnx-community/Kokoro-82M-v1.0-ONNX", {
    dtype: "q8",
    device: "cpu",
  })
}

export function resolveQuestionAnswer(transcript: string, options: string[]) {
  const normalized = transcript.toLowerCase().trim()
  const ordinals = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"]
  const ordinal = ordinals.findIndex((value) => normalized.includes(value))
  if (ordinal >= 0 && options[ordinal]) return options[ordinal]

  const numbered = normalized.match(/(?:option|number)\s+(\d+)/)?.[1]
  if (numbered && options[Number(numbered) - 1]) return options[Number(numbered) - 1]

  return options.find((option) => normalized.includes(option.toLowerCase())) ?? transcript.trim()
}

function recorder(output: string): ProcessOptions {
  const duration = process.env.VOXCODE_LISTEN_SECONDS ?? "8"
  const device = process.env.VOXCODE_MIC_DEVICE
  if (process.platform === "win32") {
    if (!device) throw new Error("Set VOXCODE_MIC_DEVICE to an FFmpeg DirectShow microphone name")
    return {
      command: process.env.VOXCODE_FFMPEG ?? "ffmpeg",
      args: [
        "-y",
        "-loglevel",
        "error",
        "-f",
        "dshow",
        "-i",
        `audio=${device}`,
        "-t",
        duration,
        "-ar",
        "16000",
        "-ac",
        "1",
        output,
      ],
    }
  }
  if (process.platform === "darwin") {
    return {
      command: process.env.VOXCODE_FFMPEG ?? "ffmpeg",
      args: [
        "-y",
        "-loglevel",
        "error",
        "-f",
        "avfoundation",
        "-i",
        device ?? ":0",
        "-t",
        duration,
        "-ar",
        "16000",
        "-ac",
        "1",
        output,
      ],
    }
  }
  return {
    command: process.env.VOXCODE_FFMPEG ?? "ffmpeg",
    args: [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "pulse",
      "-i",
      device ?? "default",
      "-t",
      duration,
      "-ar",
      "16000",
      "-ac",
      "1",
      output,
    ],
  }
}

function player(input: string): ProcessOptions {
  return {
    command: process.env.VOXCODE_FFPLAY ?? "ffplay",
    args: ["-nodisp", "-autoexit", "-loglevel", "quiet", input],
  }
}

async function transcribe(input: string) {
  const model = process.env.VOXCODE_WHISPER_MODEL
  if (!model) throw new Error("Set VOXCODE_WHISPER_MODEL to a local whisper.cpp model file")
  const output = path.join(path.dirname(input), path.basename(input, ".wav"))
  const command = process.env.VOXCODE_WHISPER_COMMAND ?? "whisper-cli"
  await run({ command, args: ["-m", model, "-f", input, "-otxt", "-of", output, "-nt"] })
  const transcript = await Bun.file(output + ".txt").text()
  await remove(output + ".txt")
  return transcript.trim()
}

function toSpeech(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, " Code block omitted. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/https?:\/\/\S+/g, " link ")
    .replace(/[*_#>|~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

async function run(options: ProcessOptions) {
  const process = Bun.spawn([options.command, ...options.args], { stdout: "ignore", stderr: "pipe" })
  const error = await new Response(process.stderr).text()
  const code = await process.exited
  if (code !== 0) throw new Error(error.trim() || `${options.command} exited with code ${code}`)
}

async function ensureDirectory(directory: string) {
  const { mkdir } = await import("node:fs/promises")
  await mkdir(directory, { recursive: true })
}

async function remove(file: string) {
  const { rm } = await import("node:fs/promises")
  await rm(file, { recursive: true, force: true })
}
