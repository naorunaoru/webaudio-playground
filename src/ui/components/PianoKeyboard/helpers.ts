/** Map a MIDI channel (0-15) to an HSL hue, evenly distributed across 360°. */
export function channelHue(channel: number): number {
  return channel * 22.5;
}
