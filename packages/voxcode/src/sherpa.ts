import { createRequire } from "node:module"

type Stream = {
  acceptWaveform(input: { sampleRate: number; samples: Float32Array }): void
  inputFinished(): void
}

type Config = {
  featConfig: { sampleRate: number; featureDim: number }
  modelConfig: {
    transducer: { encoder: string; decoder: string; joiner: string }
    tokens: string
    numThreads: number
    provider: string
    debug: number
  }
  decodingMethod: string
  maxActivePaths: number
  enableEndpoint: boolean
  rule1MinTrailingSilence: number
  rule2MinTrailingSilence: number
  rule3MinUtteranceLength: number
}

export type OnlineRecognizer = {
  createStream(): Stream
  isReady(stream: Stream): boolean
  decode(stream: Stream): void
  isEndpoint(stream: Stream): boolean
  getResult(stream: Stream): { text: string }
}

const sherpa = createRequire(import.meta.url)("sherpa-onnx-node") as {
  OnlineRecognizer: new (config: Config) => OnlineRecognizer
}

export const OnlineRecognizer = sherpa.OnlineRecognizer
