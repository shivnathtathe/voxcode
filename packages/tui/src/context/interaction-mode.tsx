import { createStore } from "solid-js/store"
import { useArgs } from "./args"
import { createSimpleContext } from "./helper"

export type InteractionMode = "text" | "voice"

export const { use: useInteractionMode, provider: InteractionModeProvider } = createSimpleContext({
  name: "InteractionMode",
  init: () => {
    const args = useArgs()
    const [store, setStore] = createStore<{ mode: InteractionMode; status?: string }>({
      mode: args.voice ? "voice" : "text",
    })
    return {
      get mode() {
        return store.mode
      },
      set(mode: InteractionMode) {
        setStore("mode", mode)
        if (mode === "text") setStore("status", undefined)
      },
      get status() {
        return store.status
      },
      setStatus(status?: string) {
        setStore("status", status)
      },
    }
  },
})
