import { createFileRoute } from "@tanstack/react-router"
import Home from "@/app/page"
import { readHome } from "@/public.functions"
export const Route = createFileRoute("/")({ loader: () => readHome(), component: Home })
