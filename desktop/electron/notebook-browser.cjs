function notebookBrowserUrl({ frameUrl, port, serverOwned }) {
  const target = new URL(`http://127.0.0.1:${port}/`)
  let frame
  try { frame = new URL(frameUrl) } catch { throw new Error('Open Lab Notebook before opening its browser link.') }
  if (!serverOwned || frame.origin !== target.origin || frame.username || frame.password || !['/', '/index.html'].includes(frame.pathname) || frame.searchParams.get('easylabModule') !== 'labnotebook') {
    throw new Error('The browser link is only available from this Suite’s Lab Notebook.')
  }
  // Only the owned local app is opened; renderer URLs and OAuth parameters are never forwarded.
  return target.href
}

module.exports = { notebookBrowserUrl }
