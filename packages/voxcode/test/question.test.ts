import { describe, expect, test } from "bun:test"
import { resolveQuestionAnswer } from "../src"

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
