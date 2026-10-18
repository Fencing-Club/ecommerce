// Register PDF.js's in-process worker through a bundled import. Edge runtimes cannot load its default file URL.
import "pdfjs-dist/legacy/build/pdf.worker.mjs"
