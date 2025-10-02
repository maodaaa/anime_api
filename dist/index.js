import { join as join2 } from "path";
var projectRoot = process.cwd();
var viewDirectories = [
  join2(projectRoot, "dist/public/views"),
  join2(projectRoot, "src/public/views")
];
var animDirectories = [
  join2(projectRoot, "dist/anims"),
  join2(projectRoot, "src/anims")
];
  for (const basePath of viewDirectories) {
    const filePath = join2(basePath, relativePath);
    if (existsSync2(filePath)) {
      const html3 = await readFile3(filePath, "utf-8");
      return c.html(html3);
    }
  }
  setResponseError(500, "gagal memuat halaman");
  return animDirectories.some((basePath) => existsSync2(join2(basePath, sanitizedRoute)));
  let htmlContent;
    if (!existsSync2(filePath)) {
      continue;
    htmlContent = await readFile3(filePath, "utf-8");
    break;
  }
  if (!htmlContent) {
    setResponseError(500, "gagal memuat halaman");
  return c.html(htmlContent);
