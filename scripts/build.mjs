#!/usr/bin/env node
// Builds the catalog HSI reads: validates every app, then writes
// dist/catalog.json (all apps with their icons inline) and, when signing,
// dist/catalog.json.sig (base64 of the raw ed25519 signature of that file).
//
//   node scripts/build.mjs           validate and build, no signature
//   node scripts/build.mjs --sign    also sign with CATALOG_SIGNING_KEY (PEM)
//
// The version is the build's date and time in UTC (YYYYMMDDHHmm), so every
// publication is newer than the last: HSI never goes back to an older catalog.
// Not the commit's date: a commit dated in the future would hold back every
// later publication.
import crypto from "node:crypto"
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import Ajv2020 from "ajv/dist/2020.js"
import addFormats from "ajv-formats"
import { XMLParser, XMLValidator } from "fast-xml-parser"

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..")
const sign = process.argv.includes("--sign")
const errors = []
const fail = (id, msg) => errors.push(`${id}: ${msg}`)

const schema = JSON.parse(readFileSync(path.join(ROOT, "schema/app-manifest.schema.json"), "utf8"))
const ajv = new Ajv2020({ allErrors: true, strict: false })
addFormats(ajv)
const validate = ajv.compile(schema)


// Icons are drawn as images by HSI, where an SVG never runs anything; they are
// still held to a short list of drawing elements and attributes, so a logo
// stays a logo wherever it is shown. Links may only point inside the icon.
const ICON_ELEMENTS = new Set(["svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "defs",
  "linearGradient", "radialGradient", "stop", "clipPath", "mask", "pattern", "title", "desc", "use", "symbol", "animateTransform"])
const ICON_ATTRIBUTES = new Set(["xmlns", "xmlns:xlink", "version", "viewBox", "width", "height", "x", "y", "x1", "x2", "y1", "y2",
  "cx", "cy", "r", "rx", "ry", "fx", "fy", "d", "points", "transform", "gradientTransform", "gradientUnits", "patternUnits",
  "patternTransform", "clipPathUnits", "maskUnits", "offset", "stop-color", "stop-opacity", "fill", "fill-rule", "fill-opacity",
  "clip-rule", "clip-path", "mask", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit",
  "stroke-dasharray", "stroke-dashoffset", "stroke-opacity", "opacity", "color", "style", "id", "class", "preserveAspectRatio",
  "xml:space", "aria-label", "aria-hidden", "role", "href", "xlink:href", "attributeName", "type", "from", "to", "dur",
  "repeatCount", "begin", "values", "keyTimes"])

function iconProblems(svg) {
  // A real XML parse: what HSI's image rendering reads, so nothing can hide
  // between the checks below and the browser (and invalid XML is refused).
  const valid = XMLValidator.validate(svg, { allowBooleanAttributes: false })
  if (valid !== true) return [`not valid XML (${valid.err.msg})`]
  const tree = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", preserveOrder: true,
    processEntities: false, ignoreDeclaration: true, commentPropName: "#comment", cdataPropName: "#cdata" }).parse(svg)
  const problems = []
  const walk = nodes => {
    for (const node of nodes) {
      const attrs = node[":@"] ?? {}
      const name = Object.keys(node).find(k => k !== ":@")
      if (name === "#text") continue
      if (name === "#comment" || name === "#cdata" || name?.startsWith("?") || name?.startsWith("!")) { problems.push("comments, CDATA and declarations are not allowed"); continue }
      if (!ICON_ELEMENTS.has(name)) problems.push(`element <${name}> is not allowed`)
      for (const [attr, raw] of Object.entries(attrs)) {
        const value = String(raw)
        if (!ICON_ATTRIBUTES.has(attr)) problems.push(`attribute ${attr} is not allowed`)
        else if ((attr === "href" || attr === "xlink:href") && !/^#[\w-]+$/.test(value)) problems.push(`${attr} may only point inside the icon`)
        else if (attr === "attributeName" && value !== "transform") problems.push("only transforms may be animated")
        // A backslash is a CSS escape (\\75rl( reads url(): never needed in a logo.
        else if (/\\/.test(value)) problems.push(`attribute ${attr} must not contain a backslash`)
        else if (/url\(\s*['"]?(?!#)/i.test(value) || /javascript:|expression\s*\(|@import|&/i.test(value)) problems.push(`attribute ${attr} reaches outside the icon`)
      }
      walk(node[name] ?? [])
    }
  }
  walk(tree)
  return [...new Set(problems)]
}

const apps = []
for (const id of readdirSync(path.join(ROOT, "apps")).sort()) {
  const dir = path.join(ROOT, "apps", id)
  let manifest
  try { manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) } catch (e) { fail(id, `manifest.json: ${e.message}`); continue }
  if (manifest.id !== id) fail(id, `the folder must be named after the id (${manifest.id})`)
  if (!validate(manifest)) for (const e of validate.errors) fail(id, `${e.instancePath || "/"} ${e.message}`)
  // The schema cannot say these; HSI refuses them too.
  for (const img of [manifest.image, ...(manifest.services ?? []).map(s => s.image)]) {
    if (typeof img === "string" && !/@sha256:[a-f0-9]{64}$/.test(img) && (!/:[^/]+$/.test(img) || /:latest$/.test(img))) fail(id, `${img} must be pinned to a tag other than latest, or a digest`)
  }
  const iconPath = path.join(dir, "icon.svg")
  if (!existsSync(iconPath)) { fail(id, "icon.svg is missing"); continue }
  const icon = readFileSync(iconPath, "utf8").trim()
  if (!icon.startsWith("<svg")) fail(id, "icon.svg must start with <svg")
  if (icon.length > 64 * 1024) fail(id, "icon.svg is over 64 KB")
  for (const problem of iconProblems(icon)) fail(id, `icon.svg: ${problem}`)
  apps.push({ ...manifest, icon })
}

if (errors.length) {
  console.error(`The catalog has ${errors.length} problem(s):\n  ${errors.join("\n  ")}`)
  process.exit(1)
}

const d = new Date()
const pad = n => String(n).padStart(2, "0")
const version = Number(`${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`)
const body = Buffer.from(JSON.stringify({ schema: 1, version, generatedAt: d.toISOString(), apps }) + "\n")

mkdirSync(path.join(ROOT, "dist"), { recursive: true })
writeFileSync(path.join(ROOT, "dist/catalog.json"), body)
console.log(`dist/catalog.json: ${apps.length} apps, version ${version}`)

if (sign) {
  const pem = process.env.CATALOG_SIGNING_KEY
  if (!pem?.trim()) { console.error("CATALOG_SIGNING_KEY is empty: set the repository secret."); process.exit(1) }
  const sig = crypto.sign(null, body, crypto.createPrivateKey(pem)).toString("base64")
  const pub = crypto.createPublicKey(readFileSync(path.join(ROOT, "catalog-signing.pub")))
  if (!crypto.verify(null, body, pub, Buffer.from(sig, "base64"))) {
    console.error("The signature does not match catalog-signing.pub: the secret and the public key are not a pair.")
    process.exit(1)
  }
  writeFileSync(path.join(ROOT, "dist/catalog.json.sig"), sig + "\n")
  console.log("dist/catalog.json.sig: signed and checked against catalog-signing.pub")
}
