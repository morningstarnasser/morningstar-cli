module.exports = {
  run: [{ method: "shell.run", params: {
    path: "..",
    message: "node bin/morningstar.js update"
  } }]
};
