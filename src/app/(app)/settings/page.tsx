import { BYOKForm } from "@/components/settings/byok-form";
import { getCurrentProvider } from "./actions";

export default async function SettingsPage() {
  const currentProvider = await getCurrentProvider();

  return (
    <div className="space-y-10 py-2">
      <header className="max-w-xl">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          settings · byok
        </div>
        <h1 className="mt-4 text-[32px] font-medium leading-tight tracking-tight">
          Bring your own key.
        </h1>
        <p
          className="mt-3 text-[15px] text-muted-foreground"
          style={{ lineHeight: 1.65 }}
        >
          Connect your own provider. Keys are encrypted at rest and only used to
          forward your messages to the model you choose. Switch any time.
        </p>
      </header>

      <BYOKForm currentProvider={currentProvider} />
    </div>
  );
}
