module.exports = async (_req, res) => {
  res.status(503).json({ error: "Function not bundled." });
};
