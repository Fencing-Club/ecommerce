import { ArrowUpRight, Box, Info } from "lucide-react"
import Link from "next/link"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

export default function Setup() {
  return (
    <main id="main-content" className="flex min-h-svh items-center justify-center bg-muted p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Box className="size-5" />
          </div>
          <CardTitle className="text-2xl font-semibold">A better handoff</CardTitle>
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
        <CardFooter>
          <Button nativeButton={false} render={<Link href="/preview" />}>
            Explore the design preview
            <ArrowUpRight data-icon="inline-end" />
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}
