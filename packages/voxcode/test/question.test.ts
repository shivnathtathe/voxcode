import { describe, expect, test } from "bun:test"
import { hasSpeech, normalizeTranscript, parseWindowsMicrophone, resolveQuestionAnswer } from "../src"

describe("resolveQuestionAnswer", () => {
  const options = ["Use SQLite", "Use PostgreSQL", "Cancel"]

  test("resolves ordinal choices", () => {
    expect(resolveQuestionAnswer("go with the first option", options)).toBe("Use SQLite")
  })

  test("resolves numbered choices", () => {
    expect(resolveQuestionAnswer("option 2", options)).toBe("Use PostgreSQL")
  })

  test("resolves spoken labels", () => {
    expect(resolveQuestionAnswer("please use PostgreSQL", options)).toBe("Use PostgreSQL")
  })

  test("keeps custom answers", () => {
    expect(resolveQuestionAnswer("use MySQL instead", options)).toBe("use MySQL instead")
  })
})

test("finds the first DirectShow microphone", () => {
  expect(
    parseWindowsMicrophone(`
[dshow @ 000001] "Integrated Camera" (video)
[dshow @ 000001] "Microphone Array (Realtek Audio)" (audio)
[dshow @ 000001]   Alternative name "@device_cm_..."
`),
  ).toBe("Microphone Array (Realtek Audio)")
})

test("drops Whisper silence markers", () => {
  expect(normalizeTranscript(" [BLANK_AUDIO] ")).toBe("")
  expect(normalizeTranscript("[NO_SPEECH]")).toBe("")
  expect(normalizeTranscript("hello")).toBe("hello")
})

test("detects speech energy in PCM audio", () => {
  expect(hasSpeech(new Int16Array(320))).toBe(false)
  expect(hasSpeech(new Int16Array(320).fill(2_000))).toBe(true)
})
