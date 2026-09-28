import { Box, Info } from "lucide-react"
import type { Metadata } from "next"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { brandTile, centeredPage, mutedBackground } from "../shell.css"
import { sx } from "@/styles/sprinkles.css"

export const metadata: Metadata = { title: "Set up" }

export default function Setup() {
  return (
    <main id="main-content" className={cn(centeredPage, mutedBackground)}>
      <Card className={sx({ width: "full", maxWidth: "lg" })}>
        <CardHeader>
          <div className={brandTile}>
            <Box className={sx({ size: 5 })} />
          </div>
          <CardTitle className={sx({ text: "2xl", fontWeight: "semibold" })}>A better handoff</CardTitle>
          <CardDescription>
            One shared workspace for your suppliers, purchase orders, carton details, and Amazon shipment labels.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert role="note">
            <Info />
            <AlertDescription>
              This installation is waiting for its WorkOS configuration. Sign-in stays closed until authentication is
              connected.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </main>
  )
}
