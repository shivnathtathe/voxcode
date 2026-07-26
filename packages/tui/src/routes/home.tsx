import { Prompt, type PromptRef } from "../component/prompt"
import { createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { Logo } from "../component/logo"
import { useSync } from "../context/sync"
import { Toast, useToast } from "../ui/toast"
import { useArgs } from "../context/args"
import { useRouteData } from "../context/route"
import { usePromptRef } from "../context/prompt"
import { useLocal } from "../context/local"
import { usePluginRuntime } from "../plugin/runtime"
import { useEditorContext } from "../context/editor"
import { useTerminalDimensions } from "@opentui/solid"
import { useTuiConfig } from "../config"
import { HomeSessionDestinationProvider } from "./home/session-destination"
import { useInteractionMode } from "../context/interaction-mode"
import { errorMessage } from "../util/error"

let once = false
const placeholder = {
  normal: ["Fix a TODO in the codebase", "What is the tech stack of this project?", "Fix broken tests"],
  shell: ["ls -la", "git status", "pwd"],
}

export function Home() {
  const pluginRuntime = usePluginRuntime()
  const sync = useSync()
  const route = useRouteData("home")
  const promptRef = usePromptRef()
  const [ref, setRef] = createSignal<PromptRef | undefined>()
  const [voiceAttempt, setVoiceAttempt] = createSignal(0)
  const args = useArgs()
  const local = useLocal()
  const editor = useEditorContext()
  const dimensions = useTerminalDimensions()
  const tuiConfig = useTuiConfig()
  const interaction = useInteractionMode()
  const toast = useToast()
  const promptMaxWidth = createMemo(() => {
    const configured = tuiConfig.prompt?.max_width
    if (configured === "auto") return Math.max(75, Math.floor(dimensions().width * 0.7))
    return configured ?? 75
  })
  let sent = false
  let voiceStarted = false
  let voiceMode: Promise<import("@opencode-ai/voxcode").VoiceMode> | undefined

  const voice = () => {
    if (!voiceMode) {
      voiceMode = import("@opencode-ai/voxcode").then((module) =>
        module.createVoiceMode({ onStatus: (status) => interaction.setStatus(status) }),
      )
    }
    return voiceMode
  }

  onMount(() => {
    editor.clearSelection()
  })

  const bind = (r: PromptRef | undefined) => {
    setRef(r)
    promptRef.set(r)
    if (once || !r) return
    if (route.prompt) {
      r.set(route.prompt)
      once = true
      return
    }
    if (!args.prompt) return
    r.set({ input: args.prompt, parts: [] })
    once = true
  }

  // Wait for sync and model store to be ready before auto-submitting --prompt
  createEffect(() => {
    const r = ref()
    if (sent) return
    if (!r) return
    if (!sync.ready || !local.model.ready) return
    if (!args.prompt) return
    if (r.current.input !== args.prompt) return
    sent = true
    r.submit()
  })

  createEffect(() => {
    voiceAttempt()
    if (interaction.mode !== "voice") {
      voiceStarted = false
      return
    }
    const prompt = ref()
    if (voiceStarted || !prompt || !sync.ready || !local.model.ready || args.prompt) return
    voiceStarted = true
    void voice()
      .then(async (mode) => {
        await mode.ready()
        const transcript = await mode.listen((text) => prompt.set({ input: text, parts: [] }))
        if (interaction.mode !== "voice") return
        if (!transcript) {
          voiceStarted = false
          setVoiceAttempt((attempt) => attempt + 1)
          return
        }
        prompt.set({ input: transcript, parts: [] })
        await new Promise((resolve) => setTimeout(resolve, 1000))
        if (interaction.mode !== "voice" || !prompt.current.input.trim()) return
        prompt.submit()
      })
      .catch((error) => {
        voiceStarted = false
        interaction.setStatus()
        toast.show({ message: `Voice mode: ${errorMessage(error)}`, variant: "error", duration: 7000 })
      })
  })

  onCleanup(() => {
    if (voiceMode) void voiceMode.then((mode) => mode.dispose())
  })

  return (
    <HomeSessionDestinationProvider>
      <box flexGrow={1} alignItems="center" paddingLeft={2} paddingRight={2}>
        <box flexGrow={1} minHeight={0} />
        <box height={4} minHeight={0} flexShrink={1} />
        <box flexShrink={0}>
          <pluginRuntime.Slot name="home_logo" mode="replace">
            <Logo />
          </pluginRuntime.Slot>
        </box>
        <box height={1} minHeight={0} flexShrink={1} />
        <box width="100%" maxWidth={promptMaxWidth()} zIndex={1000} paddingTop={1} flexShrink={0}>
          <pluginRuntime.Slot name="home_prompt" mode="replace" ref={bind}>
            <Prompt ref={bind} right={<pluginRuntime.Slot name="home_prompt_right" />} placeholders={placeholder} />
          </pluginRuntime.Slot>
        </box>
        <pluginRuntime.Slot name="home_bottom" />
        <box flexGrow={1} minHeight={0} />
        <Toast />
      </box>
      <box width="100%" flexShrink={0}>
        <pluginRuntime.Slot name="home_footer" mode="single_winner" />
      </box>
    </HomeSessionDestinationProvider>
  )
}
