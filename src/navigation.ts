export function isGitHubPages() {
  return import.meta.env.MODE === 'github-pages'
}

// Links from the standalone map and error screen must also respect the Pages subdirectory.
export function appHref(path: string) {
  return isGitHubPages() ? `${import.meta.env.BASE_URL}#${path}` : path
}
