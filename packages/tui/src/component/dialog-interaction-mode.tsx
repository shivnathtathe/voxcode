import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { useInteractionMode } from "../context/interaction-mode"

export function DialogInteractionMode() {
  const dialog = useDialog()
  const interaction = useInteractionMode()
  const options = [
    { title: "Text", value: "text" as const, description: "Use keyboard input without voice services" },
    { title: "Voice", value: "voice" as const, description: "Speak prompts and hear assistant responses" },
  ]

  return (
    <DialogSelect
      title="Select interaction mode"
      options={options}
      current={interaction.mode}
      flat
      skipFilter
      onSelect={(option) => {
        interaction.set(option.value)
        dialog.clear()
      }}
    />
  )
}
