module.exports = {
  run: [{ method: "shell.run", params: { path: "..", message: [
    "node pinokio/setup.cjs check",
    "npm ci",
    "npm run build",
    "node pinokio/setup.cjs finish"
  ] } }]
};
