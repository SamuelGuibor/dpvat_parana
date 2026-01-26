export function extractMentions(text: string) {
  const regex = /@(.+?)\[(.+?)\]/g;
  const mentions: { display: string; id: string }[] = [];

  for (const match of text.matchAll(regex)) {
    const [, display, id] = match;
    mentions.push({ display, id });
  }

  return mentions;
}
