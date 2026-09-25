import { Box } from "lucide-react"
import { WorkspaceForm } from "@/components/settings-forms"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { identity } from "@/server/auth"

export default async function Onboarding() {
  await identity()
  return (
    <main id="main-content" className="flex min-h-svh items-center justify-center bg-muted p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Box className="size-5" />
          </div>
          <CardTitle className="text-xl">Welcome to Copacker</CardTitle>
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
