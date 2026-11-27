module.exports = {
  run: [{ method: "shell.run", params: {
    path: "..",
    message: "node scripts/launch-ollama.mjs --dir pinokio/workspace",
    input: true,
    // Do not interpret model/tool text containing Error: as a launcher failure.
    on: [{ event: "/error:/i", break: false }]
  } }]
};
