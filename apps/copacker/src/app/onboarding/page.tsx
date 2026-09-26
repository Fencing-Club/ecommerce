import { Box } from "lucide-react"
import { WorkspaceForm } from "@/components/settings-forms"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { identity } from "@/server/auth"
import { brandTile, centeredPage, mutedBackground } from "../shell.css"
import { sx } from "@/styles/sprinkles.css"

// Rendered per request: at build time the WorkOS settings are absent, so a prerendered page would always go to setup.
export const dynamic = "force-dynamic"
export default async function Onboarding() {
  await identity()
  return (
    <main id="main-content" className={cn(centeredPage, mutedBackground)}>
      <Card className={sx({ width: "full", maxWidth: "md" })}>
        <CardHeader>
          <div className={brandTile}>
            <Box className={sx({ size: 5 })} />
          </div>
          <CardTitle className={sx({ text: "xl" })}>Welcome to Copacker</CardTitle>
          <CardDescription>
            Create your company workspace. Suppliers can manage purchase orders from multiple buyers in one place.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkspaceForm />
        </CardContent>
      </Card>
    </main>
  )
}
