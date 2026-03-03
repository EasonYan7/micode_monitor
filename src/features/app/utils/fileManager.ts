export function getClientPlatform(): string {
  if (typeof navigator === "undefined") {
    return "";
  }
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ?? navigator.platform ?? "";
  return platform.toLowerCase();
}

export function isWindowsPlatform(): boolean {
  return getClientPlatform().includes("win");
}

export function isMacPlatform(): boolean {
  return getClientPlatform().includes("mac");
}

export function getFileManagerName(): string {
  if (isWindowsPlatform()) {
    return "Explorer";
  }
  if (isMacPlatform()) {
    return "Finder";
  }
  return "File Manager";
}

export function getRevealInFileManagerLabel(): string {
  if (isWindowsPlatform()) {
    return "Show in Explorer";
  }
  if (isMacPlatform()) {
    return "Reveal in Finder";
  }
  return "Reveal in File Manager";
}

export function getShowInFileManagerLabel(): string {
  if (isWindowsPlatform()) {
    return "Show in Explorer";
  }
  if (isMacPlatform()) {
    return "Show in Finder";
  }
  return "Show in File Manager";
}
