export class MagnetParser {
  static MAGNET_REGEX = /magnet:\?[^\s"<>]+/gi;
  static DISPLAY_NAME_REGEX = /dn=([^&]+)/;

  static extractMagnetLinks(description: string): string[] {
    if (!description) return [];
    const matches = description.match(this.MAGNET_REGEX);
    return matches || [];
  }

  static extractDisplayName(magnetLink: string): string | null {
    const match = magnetLink.match(this.DISPLAY_NAME_REGEX);
    if (!match) return null;

    try {
      return decodeURIComponent(match[1].replace(/\+/g, ' '));
    } catch (error: any) {
      return match[1].replace(/\+/g, ' ');
    }
  }
}