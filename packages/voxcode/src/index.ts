import path from "node:path"
import os from "node:os"

const MODEL_REPOSITORY = "https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-20M-2023-02-17/resolve/main"
const MODEL_FILES = {
  encoder: "encoder-epoch-99-avg-1.int8.onnx",
  decoder: "decoder-epoch-99-avg-1.int8.onnx",
  joiner: "joiner-epoch-99-avg-1.int8.onnx",
  tokens: "tokens.txt",
}

export type VoiceMode = {
  ready(): Promise<void>
  speak(text: string): Promise<void>
  listen(onTranscript?: (text: string) => void): Promise<string>
  dispose(): Promise<void>
}

export type VoiceModeOptions = {
  onStatus?(status?: string): void
}

type ProcessOptions = {
  command: string
  args: string[]
}

export function createVoiceMode(options: VoiceModeOptions = {}): VoiceMode {
  const directory = path.join(os.tmpdir(), `opencode-voice-${process.pid}`)
  const files = new Set<string>()
  let dependencies: ReturnType<typeof setup> | undefined
  let tts: ReturnType<typeof loadTts> | undefined
  let sequence = Promise.resolve()
  let disposed = false

  const runtime = () => (dependencies ??= setup(options.onStatus))
  const enqueue = <T>(task: () => Promise<T>) => {
    const result = sequence.then(task, task)
    sequence = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  return {
    async ready() {
      await runtime()
    },
    speak(text) {
      return enqueue(async () => {
        if (disposed || !text.trim()) return
        options.onStatus?.("Speaking...")
        const dependencies = await runtime()
        await ensureDirectory(directory)
        const output = path.join(directory, `speech-${Date.now()}.wav`)
        files.add(output)
        const model = await (tts ??= loadTts())
        const audio = await model.generate(toSpeech(text), {
          voice: (process.env.VOXCODE_KOKORO_VOICE ?? "af_heart") as NonNullable<
            Parameters<typeof model.generate>[1]
          >["voice"],
        })
        await audio.save(output)
        await play(output, dependencies.ffmpeg)
        await remove(output)
        files.delete(output)
        options.onStatus?.()
      })
    },
    listen(onTranscript) {
      return enqueue(async () => {
        if (disposed) return ""
        const dependencies = await runtime()
        options.onStatus?.("Listening...")
        const result = await listen(dependencies.ffmpeg, dependencies.recognizer, onTranscript)
        options.onStatus?.()
        return normalizeTranscript(result)
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

async function setup(onStatus?: (status?: string) => void) {
  onStatus?.("Setting up voice mode...")
  const [model, ffmpeg, sherpa] = await Promise.all([ensureModel(onStatus), findFfmpeg(), import("./sherpa")])
  const recognizer = new sherpa.OnlineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      transducer: {
        encoder: path.join(model, MODEL_FILES.encoder),
        decoder: path.join(model, MODEL_FILES.decoder),
        joiner: path.join(model, MODEL_FILES.joiner),
      },
      tokens: path.join(model, MODEL_FILES.tokens),
      numThreads: Math.max(1, Math.min(4, os.availableParallelism() - 1)),
      provider: "cpu",
      debug: 0,
    },
    decodingMethod: "greedy_search",
    maxActivePaths: 4,
    enableEndpoint: true,
    rule1MinTrailingSilence: 1.2,
    rule2MinTrailingSilence: 0.7,
    rule3MinUtteranceLength: Number(process.env.VOXCODE_LISTEN_SECONDS ?? 30),
  })
  onStatus?.()
  return { ffmpeg, recognizer }
}

async function ensureModel(onStatus?: (status?: string) => void) {
  const directory = process.env.VOXCODE_STT_MODEL ?? path.join(voiceCacheDirectory(), "zipformer-en-20m")
  await ensureDirectory(directory)
  for (const [index, file] of Object.values(MODEL_FILES).entries()) {
    const output = path.join(directory, file)
    if (await Bun.file(output).exists()) continue
    await download(`${MODEL_REPOSITORY}/${file}`, output, index + 1, Object.keys(MODEL_FILES).length, onStatus)
  }
  return directory
}

async function download(url: string, output: string, index: number, count: number, onStatus?: (status?: string) => void) {
  const response = await fetch(url)
  if (!response.ok || !response.body) throw new Error(`Could not download voice model: HTTP ${response.status}`)
  const temporary = output + ".download"
  const writer = Bun.file(temporary).writer()
  const reader = response.body.getReader()
  const total = Number(response.headers.get("content-length"))
  let received = 0
  let reported = -1
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    writer.write(chunk.value)
    received += chunk.value.byteLength
    const percent = total ? Math.floor((received / total) * 100) : 0
    if (percent === reported) continue
    reported = percent
    const progress = total ? ` ${percent}%` : ""
    onStatus?.(`Downloading voice model ${index}/${count}...${progress}`)
  }
  await writer.end()
  const { rename } = await import("node:fs/promises")
  await rename(temporary, output)
}

function voiceCacheDirectory() {
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "opencode", "voice")
  }
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Caches", "opencode", "voice")
  return path.join(process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache"), "opencode", "voice")
}

async function findFfmpeg() {
  if (await works("ffmpeg", ["-version"])) return "ffmpeg"
  const module = await import("ffmpeg-static")
  const bundled = module.default
  if (!bundled) throw new Error("No FFmpeg binary is available for this platform")
  return bundled
}

async function listen(
  ffmpeg: string,
  recognizer: import("./sherpa").OnlineRecognizer,
  onTranscript?: (text: string) => void,
) {
  const base = ["-y", "-loglevel", "error"]
  const tail = ["-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", "-f", "s16le", "pipe:1"]
  const processOptions =
    process.platform === "win32"
      ? {
          command: ffmpeg,
          args: [
            ...base,
            "-f",
            "dshow",
            "-i",
            `audio=${process.env.VOXCODE_MIC_DEVICE ?? (await windowsMicrophone(ffmpeg))}`,
            ...tail,
          ],
        }
      : process.platform === "darwin"
        ? {
            command: ffmpeg,
            args: [...base, "-f", "avfoundation", "-i", process.env.VOXCODE_MIC_DEVICE ?? ":0", ...tail],
          }
        : await linuxMicrophone(ffmpeg, base, tail)
  return streamSpeech(processOptions, recognizer, onTranscript)
}

async function linuxMicrophone(ffmpeg: string, base: string[], tail: string[]) {
  const device = process.env.VOXCODE_MIC_DEVICE ?? "default"
  if (await works(ffmpeg, ["-hide_banner", "-f", "pulse", "-i", device, "-t", "0.01", "-f", "null", "-"])) {
    return { command: ffmpeg, args: [...base, "-f", "pulse", "-i", device, ...tail] }
  }
  return { command: ffmpeg, args: [...base, "-f", "alsa", "-i", device, ...tail] }
}

async function streamSpeech(
  options: ProcessOptions,
  recognizer: import("./sherpa").OnlineRecognizer,
  onTranscript?: (text: string) => void,
) {
  const child = Bun.spawn([options.command, ...options.args], { stdout: "pipe", stderr: "pipe" })
  const stderr = new Response(child.stderr).text()
  const reader = child.stdout.getReader()
  const stream = recognizer.createStream()
  const threshold = Number(process.env.VOXCODE_SILENCE_THRESHOLD ?? 500)
  const noSpeechSamples = Number(process.env.VOXCODE_NO_SPEECH_MS ?? 5000) * 16
  const maximumSamples = Number(process.env.VOXCODE_LISTEN_SECONDS ?? 30) * 16000
  const frameBytes = 320 * Int16Array.BYTES_PER_ELEMENT
  let pending = Buffer.alloc(0)
  let heardSpeech = false
  let total = 0
  let transcript = ""

  while (total < maximumSamples) {
    const result = await reader.read()
    if (result.done) break
    pending = Buffer.concat([pending, result.value])
    while (pending.byteLength >= frameBytes) {
      const frame = pending.subarray(0, frameBytes)
      pending = pending.subarray(frameBytes)
      total += 320
      const pcm = new Int16Array(frame.buffer, frame.byteOffset, 320)
      heardSpeech ||= hasSpeech(pcm, threshold)
      stream.acceptWaveform({ sampleRate: 16000, samples: Float32Array.from(pcm, (sample) => sample / 32768) })
      while (recognizer.isReady(stream)) recognizer.decode(stream)
      const partial = recognizer.getResult(stream).text.trim()
      if (partial && partial !== transcript) {
        transcript = partial
        onTranscript?.(partial)
      }
      if (heardSpeech && recognizer.isEndpoint(stream)) break
    }
    if ((heardSpeech && recognizer.isEndpoint(stream)) || (!heardSpeech && total >= noSpeechSamples)) break
  }

  stream.inputFinished()
  while (recognizer.isReady(stream)) recognizer.decode(stream)
  transcript = recognizer.getResult(stream).text.trim() || transcript
  child.kill()
  await child.exited
  const error = (await stderr).trim()
  if (!heardSpeech && error) throw new Error(error)
  return heardSpeech ? transcript : ""
}

export function hasSpeech(samples: Int16Array, threshold = 500) {
  if (!samples.length) return false
  const energy = samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length
  return Math.sqrt(energy) >= threshold
}

async function windowsMicrophone(ffmpeg: string) {
  const result = await output(ffmpeg, ["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"])
  const device = parseWindowsMicrophone(result.stderr)
  if (!device) throw new Error("No microphone was found. Check Windows microphone privacy settings.")
  return device
}

export function parseWindowsMicrophone(output: string) {
  return output.match(/"([^"]+)"\s+\(audio\)/)?.[1]
}

export function normalizeTranscript(transcript: string) {
  const text = transcript.trim()
  if (/^\[(?:BLANK_AUDIO|NO_SPEECH|SILENCE)\]$/i.test(text)) return ""
  return text
}

async function play(input: string, ffmpeg: string) {
  if (process.platform === "win32") {
    const escaped = input.replace(/'/g, "''")
    await run({
      command: "powershell.exe",
      args: [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `(New-Object System.Media.SoundPlayer '${escaped}').PlaySync()`,
      ],
    })
    return
  }
  if (process.platform === "darwin") {
    await run({ command: "afplay", args: [input] })
    return
  }
  if (await works("paplay", ["--version"])) return run({ command: "paplay", args: [input] })
  if (await works("aplay", ["--version"])) return run({ command: "aplay", args: [input] })
  if (await runOptional({ command: ffmpeg, args: ["-loglevel", "error", "-i", input, "-f", "pulse", "default"] }))
    return
  await run({ command: ffmpeg, args: ["-loglevel", "error", "-i", input, "-f", "alsa", "default"] })
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

function toSpeech(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, " Code block omitted. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/https?:\/\/\S+/g, " link ")
    .replace(/[*_#>|~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

async function works(command: string, args: string[]) {
  return output(command, args).then(
    (result) => result.code === 0,
    () => false,
  )
}

async function output(command: string, args: string[]) {
  const child = Bun.spawn([command, ...args], { stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  return { stdout, stderr, code }
}

async function runOptional(options: ProcessOptions) {
  return (await output(options.command, options.args)).code === 0
}

async function run(options: ProcessOptions) {
  const result = await output(options.command, options.args)
  if (result.code !== 0) throw new Error(result.stderr.trim() || `${options.command} exited with code ${result.code}`)
}

async function ensureDirectory(directory: string) {
  const { mkdir } = await import("node:fs/promises")
  await mkdir(directory, { recursive: true })
}

async function remove(file: string) {
  const { rm } = await import("node:fs/promises")
  await rm(file, { recursive: true, force: true })
}
