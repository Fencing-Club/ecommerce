// Frees `canvas`'s WebGL context once the canvas has left the page, rather than whenever it's garbage collected: a phone
// keeps only a few contexts at a time. A canvas still on the page, as when React runs its effect again, keeps its own.
export function releaseWhenGone(canvas: HTMLCanvasElement, gl: WebGLRenderingContext | WebGL2RenderingContext) {
  setTimeout(() => {
    if (!canvas.isConnected) {
      gl.getExtension("WEBGL_lose_context")?.loseContext()
    }
  })
}
