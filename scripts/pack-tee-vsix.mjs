#!/usr/bin/env node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const ext = join(root, "editor", "vscode-tee");
const pkg = JSON.parse(readFileSync(join(ext, "package.json"), "utf8"));
const out = join(root, "editor", "tee-language.vsix");

const manifest = `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="${pkg.name}" Version="${pkg.version}" Publisher="${pkg.publisher}"/>
    <DisplayName>${pkg.displayName}</DisplayName>
    <Description xml:space="preserve">${escapeXml(pkg.description)}</Description>
    <Tags>tee,tsx,tee-framework</Tags>
    <Categories>Programming Languages</Categories>
    <Icon>extension/icons/tee.png</Icon>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code"/>
  </Installation>
  <Dependencies/>
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
  </Assets>
</PackageManifest>
`;

const contentTypes = `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json"/>
  <Default Extension="vsixmanifest" ContentType="text/xml"/>
  <Default Extension="xml" ContentType="text/xml"/>
  <Default Extension="cjs" ContentType="text/javascript"/>
  <Default Extension="md" ContentType="text/markdown"/>
  <Default Extension="svg" ContentType="image/svg+xml"/>
  <Default Extension="png" ContentType="image/png"/>
</Types>
`;

const staging = mkdtempSync(join(tmpdir(), "tee-vsix-"));
writeFileSync(join(staging, "extension.vsixmanifest"), manifest);
writeFileSync(join(staging, "[Content_Types].xml"), contentTypes);
mkdirSync(join(staging, "extension"));

const copy = spawnSync("cp", ["-R", `${ext}/.`, join(staging, "extension")], { encoding: "utf8" });
if (copy.status !== 0) {
  console.error(copy.stderr || copy.error);
  process.exit(1);
}

const zip = spawnSync(
  "python3",
  [
    "-c",
    `
import zipfile, os, sys
root = sys.argv[1]
out = sys.argv[2]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for dirpath, dirs, files in os.walk(root):
        dirs.sort()
        files.sort()
        for name in files:
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, root)
            info = zipfile.ZipInfo(rel.replace(os.sep, "/"), (1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o100644 & 0xFFFF) << 16
            with open(full, "rb") as source:
                z.writestr(info, source.read())
`,
    staging,
    out,
  ],
  { encoding: "utf8" },
);
rmSync(staging, { recursive: true, force: true });
if (zip.status !== 0) {
  console.error(zip.stderr || zip.stdout || zip.error);
  process.exit(1);
}
console.log(`packed ${out} (${pkg.version})`);

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
